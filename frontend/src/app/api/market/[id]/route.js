import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../../configs/contractConfig';
import { withTimeout, retry as retryAsync } from '../../../../lib/asyncServer';

// Safely stringify objects that may contain BigInt values
function safeStringify(obj) {
    return JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
}

// cache per-market for short TTL
const marketCache = new Map();
const DEFAULT_TTL = 15 * 1000;
const STALE_TTL_MS = 60 * 1000;
const inFlightById = new Map();

let marketCountCache = { ts: 0, ttl: 10 * 1000, value: null };
const notFoundCache = new Map();

// Defense-in-depth: cap attacker-driven cache key growth.
const MAX_MARKET_CACHE_ENTRIES = 600;
const MAX_NOTFOUND_CACHE_ENTRIES = 1000;
const MAX_INFLIGHT_IDS = 80;

function pruneMapByTtl(map, nowMs, ttlMs, maxEntries) {
    try {
        for (const [k, v] of map.entries()) {
            if (!v || typeof v.ts !== 'number') {
                map.delete(k);
                continue;
            }
            if (nowMs - v.ts > ttlMs) {
                map.delete(k);
            }
        }

        // Drop oldest entries first (Map preserves insertion order).
        while (map.size > maxEntries) {
            const firstKey = map.keys().next().value;
            if (firstKey === undefined) break;
            map.delete(firstKey);
        }
    } catch {
        // ignore prune failures
    }
}

function capMapSize(map, maxEntries) {
    try {
        while (map.size > maxEntries) {
            const firstKey = map.keys().next().value;
            if (firstKey === undefined) break;
            map.delete(firstKey);
        }
    } catch {
        // ignore
    }
}

function isLocalhostRequest(req) {
    function isLocalHostname(hostname) {
        const host = String(hostname || '').toLowerCase();
        if (!host) return false;
        if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
        if (host === '127.0.0.1' || host.startsWith('127.')) return true;
        // Treat private LAN IPs as local to avoid noisy dev rate limiting
        if (host.startsWith('10.')) return true;
        if (host.startsWith('192.168.')) return true;
        const m = host.match(/^172\.(\d{1,3})\./);
        if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && n >= 16 && n <= 31) return true;
        }
        return false;
    }

    try {
        const url = typeof req?.url === 'string' ? new URL(req.url) : null;
        return isLocalHostname(url?.hostname);
    } catch (_e) {
        try {
            const hostHeader = String(req?.headers?.get?.('host') || '').toLowerCase();
            // host header may include port; ipv6 is bracketed
            let hostname = hostHeader;
            if (hostname.startsWith('[')) {
                const end = hostname.indexOf(']');
                hostname = end !== -1 ? hostname.slice(1, end) : hostname;
            } else {
                hostname = hostname.split(':')[0];
            }
            return isLocalHostname(hostname);
        } catch (_e2) {
            return false;
        }
    }
}

function getInMemoryCached(id, now, { allowStale } = {}) {
    const cached = marketCache.get(id);
    if (!cached) return null;
    const age = now - cached.ts;
    if (age <= cached.ttl) return { kind: 'fresh', data: cached.data };
    if (allowStale && age <= STALE_TTL_MS) return { kind: 'stale', data: cached.data };
    return null;
}

function jsonResponse(payload, { status = 200, cacheControl, extraHeaders } = {}) {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    if (cacheControl) headers.set('Cache-Control', cacheControl);
    if (extraHeaders) {
        for (const [k, v] of Object.entries(extraHeaders)) {
            if (v !== undefined && v !== null) headers.set(k, String(v));
        }
    }
    return new Response(safeStringify(payload), { status, headers });
}

export async function GET(req, { params }) {
    try {
        // `params` is a Promise in Next.js app-route dynamic handlers — await it
        const resolvedParams = await params;
        const id = Number(resolvedParams?.id);
        if (Number.isNaN(id)) {
            const isDev = process.env.NODE_ENV !== 'production';
            if (isDev) {
                console.warn('market: invalid id param (dev)', { params: resolvedParams });
            } else {
                try {
                    const { recordSecurityEvent } = await import('../../../../lib/securityTelemetry');
                    recordSecurityEvent('api_bad_request', { route: 'GET:/api/market/[id]', reason: 'invalid_id_param' });
                } catch {
                    // ignore
                }
            }
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
            const isDev = process.env.NODE_ENV !== 'production';
            if (isDev) {
                console.warn('market: id out of allowed bounds (dev)', { id });
            } else {
                try {
                    const { recordSecurityEvent } = await import('../../../../lib/securityTelemetry');
                    recordSecurityEvent('api_bad_request', { route: 'GET:/api/market/[id]', reason: 'id_out_of_bounds' });
                } catch {
                    // ignore
                }
            }
            return new Response(safeStringify({ error: 'Invalid market id' }), { status: 400, headers });
        }
        const isDev = process.env.NODE_ENV !== 'production';
        const { selectRpcUrl } = await import('../../../../lib/rpcFailover');
        const rpc = await selectRpcUrl({ isDev, requiredContractAddress: CONTRACT_ADDRESS });

        const now = Date.now();

        // Prune attacker-keyed caches.
        pruneMapByTtl(marketCache, now, STALE_TTL_MS, MAX_MARKET_CACHE_ENTRIES);
        pruneMapByTtl(notFoundCache, now, 60 * 1000, MAX_NOTFOUND_CACHE_ENTRIES);
        capMapSize(inFlightById, MAX_INFLIGHT_IDS);

        // Cache-first
        const memCached = getInMemoryCached(id, now);
        if (memCached) {
            return jsonResponse(memCached.data, {
                status: 200,
                cacheControl: 'public, s-maxage=60, stale-while-revalidate=120',
                extraHeaders: { 'X-Market-Cache': `memory:${memCached.kind}` },
            });
        }

        // Coalesce bursts for the same id
        const existing = inFlightById.get(id);
        if (existing) {
            try {
                await withTimeout(existing, 10000, 'market in-flight timed out');
            } catch (_e) {
                // ignore
            }
            const memAfterWait = getInMemoryCached(id, Date.now(), { allowStale: true });
            if (memAfterWait) {
                return jsonResponse(
                    { ...memAfterWait.data, degraded: memAfterWait.kind === 'stale' },
                    {
                        status: 200,
                        cacheControl: 'public, max-age=5',
                        extraHeaders: { 'X-Market-Cache': `memory:${memAfterWait.kind}`, 'X-Market-Coalesced': '1' },
                    }
                );
            }
        }

        // Negative cache for missing markets
        const nf = notFoundCache.get(id);
        if (nf && now - nf.ts <= nf.ttl) {
            return jsonResponse({ error: 'Market not found' }, { status: 404, cacheControl: 'no-store', extraHeaders: { 'X-Market-NotFound': '1' } });
        }

        // Only rate limit when we would otherwise hit the chain.
        const isLocal = isDev || isLocalhostRequest(req);
        if (!isLocal) {
            try {
                const { checkRateLimit } = await import('../../../../lib/rateLimit');
                const rl = await checkRateLimit(req, { limit: 180, windowSeconds: 60, scope: 'GET:/api/market/[id]' });
                if (rl) {
                    const staleMem = getInMemoryCached(id, Date.now(), { allowStale: true });
                    if (staleMem) {
                        return jsonResponse(
                            { ...staleMem.data, degraded: true },
                            {
                                status: 200,
                                cacheControl: 'public, max-age=5',
                                extraHeaders: { 'X-Market-Cache': `memory:${staleMem.kind}`, 'X-RateLimited': '1' },
                            }
                        );
                    }
                    return rl;
                }
            } catch (_e) {
                // ignore rate limiter failures
            }
        }

        if (!rpc) {
            if (isDev) console.warn(`market:${id} - no RPC configured`);
            return jsonResponse({ error: 'BDAG RPC not configured' }, { status: 502, cacheControl: 'no-store' });
        }

        const work = (async () => {
            const provider = new ethers.JsonRpcProvider(rpc);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            const adminContract = new ethers.Contract(
                CONTRACT_ADDRESS,
                [
                    "function getMarketAdmin(uint256 id) view returns (address creator, bool paused, bool disputeUsed, bool disputeActive, address disputeOpener, uint256 disputeBond)",
                ],
                provider
            );

            // Quick existence check to avoid returning 502 for non-existent markets.
            // Cache marketCount briefly to reduce repeat calls.
            let countBn = null;
            try {
                if (marketCountCache.value !== null && now - marketCountCache.ts <= marketCountCache.ttl) {
                    countBn = marketCountCache.value;
                } else {
                    countBn = await retryAsync(() => withTimeout(contract.marketCount(), 8000, 'RPC marketCount timed out'));
                    marketCountCache = { ts: Date.now(), ttl: marketCountCache.ttl, value: countBn };
                }
            } catch (countErr) {
                if (isDev) console.error('market: marketCount() failed', countErr);
                // If marketCount fails, we still attempt getMarket; stale fallback will handle transient issues.
            }
            if (countBn !== null) {
                const count = Number(countBn);
                if (Number.isFinite(count) && id >= count) {
                    notFoundCache.set(id, { ts: Date.now(), ttl: 15 * 1000 });
                    return { kind: 'not-found' };
                }
            }

            let m;
            try {
                m = await withTimeout(contract.getMarket(id), 8000, 'RPC getMarket timed out');
            } catch (callErr) {
                // If the call reverted, treat it as missing market rather than a gateway failure.
                const code = String(callErr?.code || '');
                const msg = String(callErr?.shortMessage || callErr?.message || callErr);
                const looksMissing = code === 'CALL_EXCEPTION' || /execution reverted|call exception|missing revert data/i.test(msg);
                if (looksMissing) {
                    notFoundCache.set(id, { ts: Date.now(), ttl: 15 * 1000 });
                    return { kind: 'not-found' };
                }
                throw callErr;
            }

            let basics = {};
            try {
                basics = await withTimeout(contract.getMarketBasics(id), 8000, 'RPC getMarketBasics timed out').catch(() => ({}));
            } catch (basErr) {
                if (isDev) {
                    console.warn(`market:${id} getMarketBasics() failed (dev)`, basErr);
                } else {
                    try {
                        const { recordSecurityEvent } = await import('../../../../lib/securityTelemetry');
                        recordSecurityEvent('api_error', { route: 'GET:/api/market/[id]', kind: 'getMarketBasics_failed' });
                    } catch {
                        // ignore
                    }
                }
                basics = {};
            }

            // Ethers Result objects don't always enumerate named keys when spread.
            // Extract by both named fields and positional indices.
            const b = basics || {};
            const basicsCategory = String(b.category ?? b[2] ?? '');
            const basicsDescription = String(b.description ?? b[1] ?? '');
            const basicsEndTime = String(b.endTime ?? b[3] ?? '0');
            const basicsMarketType = b.marketType ?? b[4];
            const basicsStatus = b.status ?? b[5];

            const payload = {
                id,
                question: m.question,
                description: basicsDescription,
                category: basicsCategory,
                yesPool: String(m.yesPool ?? '0'),
                noPool: String(m.noPool ?? '0'),
                status: Number(m.status ?? 0),
                outcome: m.outcome ?? false,
                closeTime: String(m.closeTime ?? 0),
                paused: false,
                disputeUsed: false,
                disputeActive: false,
                // include basics-derived fields in case clients use them
                endTime: basicsEndTime,
                marketTypeFromBasics: typeof basicsMarketType === 'bigint' ? Number(basicsMarketType) : Number(basicsMarketType ?? 0),
                statusFromBasics: typeof basicsStatus === 'bigint' ? Number(basicsStatus) : Number(basicsStatus ?? 0),
            };

            // Dispute/admin flags (non-fatal)
            try {
                const admin = await withTimeout(adminContract.getMarketAdmin(id), 8000, 'RPC getMarketAdmin timed out');
                payload.paused = Boolean(admin.paused);
                payload.disputeUsed = Boolean(admin.disputeUsed);
                payload.disputeActive = Boolean(admin.disputeActive);
            } catch (_e) {
                // ignore
            }

            marketCache.set(id, { ts: Date.now(), ttl: DEFAULT_TTL, data: payload });
            return { kind: 'ok', payload };
        })();

        inFlightById.set(id, work);
        let result;
        try {
            result = await work;
        } catch (workErr) {
            const staleMem = getInMemoryCached(id, Date.now(), { allowStale: true });
            if (staleMem) {
                return jsonResponse(
                    { ...staleMem.data, degraded: true },
                    {
                        status: 200,
                        cacheControl: 'public, max-age=5',
                        extraHeaders: { 'X-Market-Cache': `memory:${staleMem.kind}`, 'X-Market-Degraded': '1' },
                    }
                );
            }
            throw workErr;
        } finally {
            inFlightById.delete(id);
        }

        if (result?.kind === 'not-found') {
            return jsonResponse({ error: 'Market not found' }, { status: 404, cacheControl: 'no-store' });
        }

        if (result?.kind === 'ok') {
            return jsonResponse(result.payload, {
                status: 200,
                cacheControl: 'public, s-maxage=60, stale-while-revalidate=120',
                extraHeaders: { 'X-Market-Cache': 'miss' },
            });
        }

        // Should never happen, but keep a safe failure mode.
        return jsonResponse({ error: 'Internal Server Error' }, { status: 500, cacheControl: 'no-store' });
    } catch (err) {
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev) {
            console.warn('API market error (dev, redacted):', String(err?.message || err));
        } else {
            try {
                const { recordSecurityEvent } = await import('../../../../lib/securityTelemetry');
                recordSecurityEvent('api_error', { route: 'GET:/api/market/[id]', kind: 'unhandled' });
            } catch {
                // ignore
            }
        }
        let detail;
        if (process.env.NODE_ENV !== 'production') {
            try {
                const { redactLikelySecrets } = await import('../../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }
        }
        return jsonResponse({ error: 'Bad Gateway', detail }, { status: 502, cacheControl: 'no-store' });
    }
}
