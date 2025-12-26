import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../../configs/contractConfig';
import { withTimeout } from '../../../../lib/asyncServer';

// Safely stringify objects that may contain BigInt values
function safeStringify(obj) {
    return JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
}

// cache per-market for short TTL
const marketCache = new Map();
const DEFAULT_TTL = 15 * 1000;

export async function GET(req, { params }) {
    try {
        // `params` is a Promise in Next.js app-route dynamic handlers — await it
        const resolvedParams = await params;
        const id = Number(resolvedParams?.id);
        if (Number.isNaN(id)) {
            console.error('market: invalid id param', { params: resolvedParams });
            const headers = new Headers();
            headers.set('Content-Type', 'application/json; charset=utf-8');
            headers.set('Cache-Control', 'no-store');
            return new Response(safeStringify({ error: 'Invalid market id' }), { status: 400, headers });
        }
        // Basic bounds check to avoid extremely large ids (defense-in-depth)
        if (!Number.isInteger(id) || id < 0 || id > 10_000_000) {
            const headers = new Headers();
            headers.set('Content-Type', 'application/json; charset=utf-8');
            headers.set('Cache-Control', 'no-store');
            console.warn('market: id out of allowed bounds', { id });
            return new Response(safeStringify({ error: 'Invalid market id' }), { status: 400, headers });
        }
        const isDev = process.env.NODE_ENV !== 'production';
        const rpc = process.env.BDAG_RPC || (isDev ? process.env.DEV_FALLBACK_RPC || '' : '');

        // Rate limit requests early
        try {
            const { checkRateLimit } = await import('../../../../lib/rateLimit');
            const rl = await checkRateLimit(req);
            if (rl) return rl;
        } catch {
            // ignore rate limiter failures
        }

        if (!rpc) {
            if (isDev) console.warn(`market:${id} - no RPC configured`);
            else {
                const headers = new Headers();
                headers.set('Content-Type', 'application/json; charset=utf-8');
                headers.set('Cache-Control', 'no-store');
                return new Response(safeStringify({ error: 'BDAG RPC not configured' }), { status: 502, headers });
            }
            const headers = new Headers();
            headers.set('Content-Type', 'application/json; charset=utf-8');
            headers.set('Cache-Control', 'no-store');
            return new Response(safeStringify({ error: 'RPC not configured' }), { status: 404, headers });
        }

        const now = Date.now();
        const cached = marketCache.get(id);
        if (cached && (now - cached.ts) <= cached.ttl) {
            const headers = new Headers();
            headers.set('Cache-Control', `public, max-age=${Math.floor(cached.ttl / 1000)}`);
            headers.set('Content-Type', 'application/json; charset=utf-8');
            return new Response(safeStringify(cached.data), { status: 200, headers });
        }

        const provider = new ethers.JsonRpcProvider(rpc);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        let m;
        try {
            m = await withTimeout(contract.getMarket(id), 8000, 'RPC getMarket timed out');
        } catch (callErr) {
            console.error(`market:${id} getMarket() failed`, callErr);
            const headers = new Headers();
            headers.set('Content-Type', 'application/json; charset=utf-8');
            headers.set('Cache-Control', 'no-store');
            let detail;
            if (isDev) {
                try {
                    const { redactLikelySecrets } = await import('../../../../lib/redact');
                    detail = redactLikelySecrets(String(callErr?.message || callErr));
                } catch {
                    detail = String(callErr?.message || callErr);
                }
            }
            return new Response(safeStringify({ error: 'getMarket failed', detail }), { status: 502, headers });
        }

        let basics = {};
        try {
            basics = await withTimeout(contract.getMarketBasics(id), 8000, 'RPC getMarketBasics timed out').catch(() => ({}));
        } catch (basErr) {
            console.error(`market:${id} getMarketBasics() failed`, basErr);
            // continue with empty basics
            basics = {};
        }

        const payload = {
            id,
            question: m.question,
            yesPool: String(m.yesPool ?? '0'),
            noPool: String(m.noPool ?? '0'),
            status: Number(m.status ?? 0),
            outcome: m.outcome ?? false,
            closeTime: String(m.closeTime ?? 0),
            ...basics
        };

        marketCache.set(id, { ts: now, ttl: DEFAULT_TTL, data: payload });

        const headers = new Headers();
        headers.set('Cache-Control', `public, max-age=${Math.floor(DEFAULT_TTL / 1000)}`);
        headers.set('Content-Type', 'application/json; charset=utf-8');

        return new Response(safeStringify(payload), { status: 200, headers });
    } catch (err) {
        console.error('API market error', err);
        const headers = new Headers();
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.set('Cache-Control', 'no-store');
        let detail;
        if (process.env.NODE_ENV !== 'production') {
            try {
                const { redactLikelySecrets } = await import('../../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }
        }
        return new Response(safeStringify({ error: 'Internal Server Error', detail }), { status: 500, headers });
    }
}
