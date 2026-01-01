import { redactUrlCredentials } from './redact';

const DEFAULT_TIMEOUT_MS = 1200;
const CACHE_MS = 10_000;

function shouldLogFailover({ isDev }) {
    // Keep logs quiet in production by default (especially on Vercel).
    return Boolean(isDev) || process.env.RPC_FAILOVER_DEBUG === '1';
}

function mask(url) {
    try {
        return redactUrlCredentials(url);
    } catch {
        return '(masked)';
    }
}

let cached = { url: '', ts: 0, key: '' };

function splitRpcList(raw) {
    return String(raw || '')
        .split(/[\s,]+/g)
        .map((s) => s.trim())
        .filter(Boolean);
}

function uniquePreserveOrder(urls) {
    const seen = new Set();
    const out = [];
    for (const u of urls) {
        if (seen.has(u)) continue;
        seen.add(u);
        out.push(u);
    }
    return out;
}

function isProbablyHttpRpc(url) {
    const u = String(url || '').trim().toLowerCase();
    return u.startsWith('http://') || u.startsWith('https://');
}

async function probeRpcHttp(url, timeoutMs) {
    if (!isProbablyHttpRpc(url)) return false;

    const started = Date.now();

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(200, timeoutMs || DEFAULT_TIMEOUT_MS));

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
            signal: controller.signal,
        });
        if (!res.ok) return false;
        const json = await res.json().catch(() => null);
        const ok = Boolean(json && typeof json.result === 'string' && json.result.startsWith('0x'));
        return { ok, ms: Date.now() - started, reason: ok ? 'ok' : 'bad_result' };
    } catch {
        return { ok: false, ms: Date.now() - started, reason: 'error_or_timeout' };
    } finally {
        clearTimeout(t);
    }
}

async function rpcCall(url, { method, params }, timeoutMs) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), Math.max(200, timeoutMs || DEFAULT_TIMEOUT_MS));
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] }),
            signal: controller.signal,
        });
        if (!res.ok) return null;
        return await res.json().catch(() => null);
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
}

async function probeRpcHttpWithContract(url, timeoutMs, requiredContractAddress) {
    if (!isProbablyHttpRpc(url)) return false;

    const started = Date.now();

    const bn = await rpcCall(url, { method: 'eth_blockNumber', params: [] }, timeoutMs);
    if (!bn || typeof bn.result !== 'string' || !bn.result.startsWith('0x')) {
        return { ok: false, ms: Date.now() - started, reason: 'blockNumber_failed' };
    }

    const addr = String(requiredContractAddress || '').trim();
    if (!addr) return { ok: true, ms: Date.now() - started, reason: 'ok_no_contract' };
    if (!addr.toLowerCase().startsWith('0x') || addr.length !== 42) {
        return { ok: false, ms: Date.now() - started, reason: 'invalid_contract_address' };
    }

    const code = await rpcCall(url, { method: 'eth_getCode', params: [addr, 'latest'] }, timeoutMs);
    const codeHex = String(code?.result || '').toLowerCase();
    const ok = Boolean(codeHex && codeHex !== '0x');
    return { ok, ms: Date.now() - started, reason: ok ? 'ok' : 'contract_missing' };
}

function buildCandidates({ isDev }) {
    const primary = splitRpcList(process.env.BDAG_RPC);
    const fallbacks = splitRpcList(process.env.BDAG_RPC_FALLBACKS);
    const devFallback = isDev ? splitRpcList(process.env.DEV_FALLBACK_RPC) : [];

    // Last-resort fallback: a client-safe read-only RPC can also be used on the server.
    // This prevents production misconfig from causing empty-market UX, while still
    // preferring private server RPCs when available.
    const publicRead = splitRpcList(process.env.NEXT_PUBLIC_READ_RPC);

    return uniquePreserveOrder([...primary, ...fallbacks, ...devFallback, ...publicRead]);
}

export async function selectRpcUrl({
    isDev = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    requiredContractAddress = '',
} = {}) {
    const now = Date.now();
    const cacheKey = `${isDev ? 'dev' : 'prod'}|${String(requiredContractAddress || '').toLowerCase()}`;
    if (cached.url && cached.key === cacheKey && (now - cached.ts) < CACHE_MS) return cached.url;

    const log = shouldLogFailover({ isDev });

    const candidates = buildCandidates({ isDev });
    if (candidates.length === 0) return '';

    for (const url of candidates) {
        const res = requiredContractAddress
            ? await probeRpcHttpWithContract(url, timeoutMs, requiredContractAddress)
            : await probeRpcHttp(url, timeoutMs);

        const ok = Boolean(res && res.ok);
        if (log) {
            const ms = typeof res?.ms === 'number' ? `${res.ms}ms` : 'n/a';
            const reason = res?.reason || (ok ? 'ok' : 'failed');
            console.info(`rpcFailover: probe ${mask(url)} -> ${ok ? 'OK' : 'SKIP'} (${reason}, ${ms})`);
        }

        if (ok) {
            cached = { url, ts: now, key: cacheKey };
            return url;
        }
    }

    // Nothing responded quickly; return the first candidate so callers can still attempt and produce a real error.
    const first = candidates[0] || '';
    cached = { url: first, ts: now, key: cacheKey };
    return first;
}

export function debugRpcConfig({ isDev = false } = {}) {
    const urls = buildCandidates({ isDev });
    return urls.map((u) => {
        try {
            return redactUrlCredentials(u);
        } catch {
            return '(masked)';
        }
    });
}
