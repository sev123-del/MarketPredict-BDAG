import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../configs/contractConfig';
import { redactUrlCredentials } from '../../../lib/redact';
import { withTimeout, retry as retryAsync } from '../../../lib/asyncServer';

// Safely stringify objects that may contain BigInt values
function safeStringify(obj) {
    return JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
}

function msSince(t0) {
    return Math.max(0, Date.now() - t0);
}

function formatServerTiming(entries) {
    return Object.entries(entries)
        .filter(([, v]) => Number.isFinite(v) && v >= 0)
        .map(([k, v]) => `${k};dur=${Math.round(v)}`)
        .join(', ');
}

// Page-keyed in-memory cache for serverless instance lifetime
let pageCache = {}; // { '<page>-<limit>': { ts, ttl, data, total } }
const DEFAULT_TTL = 15 * 1000;
const STALE_TTL_MS = 60 * 1000;
const inFlightByKey = new Map();

// Defense-in-depth: cap unbounded cache growth under attacker-driven cache keys.
const MAX_PAGE_CACHE_ENTRIES = 400;
const MAX_INFLIGHT_KEYS = 80;

function prunePageCache(nowMs) {
    try {
        const keys = Object.keys(pageCache);
        if (keys.length === 0) return;

        // Remove expired entries first.
        for (const k of keys) {
            const v = pageCache[k];
            if (!v || typeof v.ts !== 'number') {
                delete pageCache[k];
                continue;
            }
            // Consider entries expired after stale window.
            if (nowMs - v.ts > STALE_TTL_MS) {
                delete pageCache[k];
            }
        }

        const keysAfter = Object.keys(pageCache);
        if (keysAfter.length <= MAX_PAGE_CACHE_ENTRIES) return;

        // Still too many: delete oldest entries.
        const entries = keysAfter
            .map((k) => ({ k, ts: Number(pageCache[k]?.ts || 0) }))
            .sort((a, b) => a.ts - b.ts);
        const over = entries.length - MAX_PAGE_CACHE_ENTRIES;
        for (let i = 0; i < over; i++) {
            delete pageCache[entries[i].k];
        }
    } catch {
        // ignore prune failures
    }
}

function capInFlight() {
    try {
        while (inFlightByKey.size > MAX_INFLIGHT_KEYS) {
            const firstKey = inFlightByKey.keys().next().value;
            if (firstKey === undefined) break;
            inFlightByKey.delete(firstKey);
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
    } catch {
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
        } catch {
            return false;
        }
    }
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

function getInMemoryCached(cacheKey, now, { allowStale } = {}) {
    const cached = pageCache[cacheKey];
    if (!cached) return null;
    const age = now - cached.ts;
    if (age <= cached.ttl) return { kind: 'fresh', data: cached.data, total: cached.total };
    if (allowStale && age <= STALE_TTL_MS) return { kind: 'stale', data: cached.data, total: cached.total };
    return null;
}

async function getRedisCached(cacheKey) {
    try {
        const redis = await import('../../../lib/redisClient');
        const cached = await redis.get(`markets:${cacheKey}`);
        if (!cached) return null;
        // Defensive: avoid parsing unexpectedly huge payloads.
        if (typeof cached === 'string' && cached.length > 2_000_000) return null;
        const parsed = JSON.parse(cached);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

// Map with bounded concurrency
async function mapWithConcurrency(items, mapper, concurrency = 6) {
    const results = new Array(items.length);
    let idx = 0;

    async function worker() {
        while (true) {
            const i = idx++;
            if (i >= items.length) break;
            try {
                results[i] = await mapper(items[i], i);
            } catch {
                results[i] = null;
            }
        }
    }

    const workers = new Array(Math.min(concurrency, items.length)).fill(null).map(worker);
    await Promise.all(workers);
    return results;
}

export async function GET(req) {
    try {
        const tStart = Date.now();
        const perf = {
            cache: 'miss',
            memMs: 0,
            redisMs: 0,
            waitMs: 0,
            rlMs: 0,
            rpcMs: 0,
            chainMs: 0,
            redisWriteMs: 0,
        };

        const withPerf = (extraHeaders) => {
            const totalMs = msSince(tStart);
            const serverTiming = formatServerTiming({
                total: totalMs,
                mem: perf.memMs,
                redis: perf.redisMs,
                wait: perf.waitMs,
                rl: perf.rlMs,
                rpc: perf.rpcMs,
                chain: perf.chainMs,
                redisw: perf.redisWriteMs,
            });
            return {
                ...(extraHeaders || {}),
                'Server-Timing': serverTiming,
                'X-Perf-Total-Ms': totalMs,
                'X-Perf-Cache': perf.cache,
            };
        };

        const isDev = process.env.NODE_ENV !== 'production';
        const url = new URL(req.url);
        const rawPage = url.searchParams.get('page') || '1';
        const rawLimit = url.searchParams.get('limit') || '50';

        let page = 1;
        let limit = 50;

        try {
            const { paramIntOrResponse } = await import('../../../lib/validate');
            const pRes = paramIntOrResponse(rawPage, 'page', { min: 1, max: 1000000, fallback: 1 });
            if (!pRes.ok) return pRes.response;
            const lRes = paramIntOrResponse(rawLimit, 'limit', { min: 1, max: 200, fallback: 50 });
            if (!lRes.ok) return lRes.response;
            page = pRes.value;
            limit = lRes.value;
        } catch {
            // validation helper failed — fall back to robust parsing
            page = parseInt(rawPage, 10);
            limit = parseInt(rawLimit, 10);
            if (!Number.isInteger(page) || page < 1) {
                const headers = new Headers();
                headers.set('Content-Type', 'application/json; charset=utf-8');
                headers.set('Cache-Control', 'no-store');
                return new Response(safeStringify({ error: 'Invalid page parameter' }), { status: 400, headers });
            }
            if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
                const headers = new Headers();
                headers.set('Content-Type', 'application/json; charset=utf-8');
                headers.set('Cache-Control', 'no-store');
                return new Response(safeStringify({ error: 'Invalid limit parameter' }), { status: 400, headers });
            }
        }
        const cacheKey = `${page}-${limit}`;

        const now = Date.now();
        prunePageCache(now);

        // Cache-first: avoid burning rate-limit budget and avoid expensive RPC probing.
        const memCached = getInMemoryCached(cacheKey, now);
        if (memCached) {
            perf.cache = `memory:${memCached.kind}`;
            perf.memMs = msSince(tStart);
            return jsonResponse(
                { markets: memCached.data, total: memCached.total },
                {
                    status: 200,
                    cacheControl: 'public, s-maxage=60, stale-while-revalidate=120',
                    extraHeaders: withPerf({ 'X-Markets-Cache': `memory:${memCached.kind}` }),
                }
            );
        }

        const tRedis = Date.now();
        const redisCached = await getRedisCached(cacheKey);
        perf.redisMs += msSince(tRedis);
        if (redisCached) {
            perf.cache = 'redis';
            return jsonResponse(redisCached, {
                status: 200,
                cacheControl: 'public, s-maxage=60, stale-while-revalidate=120',
                extraHeaders: withPerf({ 'X-Markets-Cache': 'redis' }),
            });
        }

        // Coalesce bursts for the same page/limit
        const existing = inFlightByKey.get(cacheKey);
        if (existing) {
            const tWait = Date.now();
            try {
                await withTimeout(existing, 10000, 'markets in-flight timed out');
            } catch {
                // ignore
            }
            perf.waitMs += msSince(tWait);
            const memAfterWait = getInMemoryCached(cacheKey, Date.now(), { allowStale: true });
            if (memAfterWait) {
                perf.cache = `memory:${memAfterWait.kind}`;
                return jsonResponse(
                    { markets: memAfterWait.data, total: memAfterWait.total, degraded: memAfterWait.kind === 'stale' },
                    {
                        status: 200,
                        cacheControl: 'public, max-age=5',
                        extraHeaders: withPerf({ 'X-Markets-Cache': `memory:${memAfterWait.kind}`, 'X-Markets-Coalesced': '1' }),
                    }
                );
            }
            const tRedisAfterWait = Date.now();
            const redisAfterWait = await getRedisCached(cacheKey);
            perf.redisMs += msSince(tRedisAfterWait);
            if (redisAfterWait) {
                perf.cache = 'redis';
                return jsonResponse(
                    { ...redisAfterWait, degraded: true },
                    {
                        status: 200,
                        cacheControl: 'public, max-age=5',
                        extraHeaders: withPerf({ 'X-Markets-Cache': 'redis', 'X-Markets-Coalesced': '1' }),
                    }
                );
            }
        }

        // Rate limit only when we would otherwise hit the chain.
        // Skip rate limiting for localhost/dev to avoid noisy 429s during iteration.
        const isLocal = isDev || isLocalhostRequest(req);
        if (!isLocal) {
            const tRl = Date.now();
            try {
                const { checkRateLimit } = await import('../../../lib/rateLimit');
                const rl = await checkRateLimit(req, { limit: 120, windowSeconds: 60, scope: 'GET:/api/markets' });
                if (rl) {
                    const staleMem = getInMemoryCached(cacheKey, Date.now(), { allowStale: true });
                    if (staleMem) {
                        perf.rlMs += msSince(tRl);
                        perf.cache = `memory:${staleMem.kind}`;
                        return jsonResponse(
                            { markets: staleMem.data, total: staleMem.total, degraded: true },
                            {
                                status: 200,
                                cacheControl: 'public, max-age=5',
                                extraHeaders: withPerf({ 'X-Markets-Cache': `memory:${staleMem.kind}`, 'X-RateLimited': '1' }),
                            }
                        );
                    }
                    const tStaleRedis = Date.now();
                    const staleRedis = await getRedisCached(cacheKey);
                    perf.redisMs += msSince(tStaleRedis);
                    if (staleRedis) {
                        perf.rlMs += msSince(tRl);
                        perf.cache = 'redis';
                        return jsonResponse(
                            { ...staleRedis, degraded: true },
                            {
                                status: 200,
                                cacheControl: 'public, max-age=5',
                                extraHeaders: withPerf({ 'X-Markets-Cache': 'redis', 'X-RateLimited': '1' }),
                            }
                        );
                    }
                    perf.rlMs += msSince(tRl);
                    return rl;
                }
            } catch {
                // ignore rate limiter failures
            }
            perf.rlMs += msSince(tRl);
        }

        const work = (async () => {
            const { selectRpcUrl } = await import('../../../lib/rpcFailover');
            const tRpc = Date.now();
            const rpc = await selectRpcUrl({ isDev, requiredContractAddress: CONTRACT_ADDRESS });
            perf.rpcMs += msSince(tRpc);

            if (!rpc) {
                if (isDev) {
                    console.warn('markets: no RPC configured; returning empty page for resilience');
                    pageCache[cacheKey] = { ts: Date.now(), ttl: 5 * 1000, data: [], total: 0 };
                    return;
                }
                // Production: fail loudly but still avoid stampedes.
                pageCache[cacheKey] = { ts: Date.now(), ttl: 5 * 1000, data: [], total: 0 };
                throw new Error('BDAG RPC not configured');
            }

            const tChain = Date.now();

            if (isDev && rpc) {
                try {
                    console.info('markets: using rpc', redactUrlCredentials(rpc));
                } catch {
                    console.info('markets: using rpc (masked)');
                }
            }

            let provider;
            try {
                provider = new ethers.JsonRpcProvider(rpc);
            } catch (provErr) {
                if (isDev) console.error('markets: failed to create provider', provErr);
                throw provErr;
            }

            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            const adminContract = new ethers.Contract(
                CONTRACT_ADDRESS,
                [
                    "function getMarketAdmin(uint256 id) view returns (address creator, bool paused, bool disputeUsed, bool disputeActive, address disputeOpener, uint256 disputeBond)",
                ],
                provider
            );

            // get total market count (single value, cached lightly)
            let total = 0;
            try {
                const countBn = await retryAsync(() => withTimeout(contract.marketCount(), 8000, 'RPC marketCount timed out'));
                total = Number(countBn || 0);
            } catch (countErr) {
                if (isDev) console.error('markets: marketCount() failed', countErr);
                // Cache empty briefly to avoid stampede when RPC is flaky
                pageCache[cacheKey] = { ts: Date.now(), ttl: 5 * 1000, data: [], total: 0 };
                return;
            }

            // compute indices for requested page only
            const start = (page - 1) * limit;
            const end = Math.min(total, start + limit);
            const indices = [];
            for (let i = start; i < end; i++) indices.push(i);

            // fetch only requested markets with bounded concurrency and retries
            const mapper = async (idx) => {
                try {
                    const m = await retryAsync(() => withTimeout(contract.getMarket(idx), 8000, 'RPC getMarket timed out'));
                    const basics = await retryAsync(() => withTimeout(contract.getMarketBasics(idx), 8000, 'RPC getMarketBasics timed out')).catch(() => ({}));
                    const admin = await retryAsync(() => withTimeout(adminContract.getMarketAdmin(idx), 8000, 'RPC getMarketAdmin timed out')).catch(() => null);

                    // Ethers Result objects don't always enumerate named keys when spread.
                    // Extract by both named fields and positional indices.
                    const b = basics || {};
                    const basicsCategory = String(b.category ?? b[2] ?? '');
                    const basicsDescription = String(b.description ?? b[1] ?? '');
                    const basicsEndTime = String(b.endTime ?? b[3] ?? '0');
                    const basicsMarketType = b.marketType ?? b[4];
                    return {
                        id: idx,
                        question: m.question,
                        description: basicsDescription,
                        category: basicsCategory,
                        endTime: basicsEndTime,
                        yesPool: String(m.yesPool ?? '0'),
                        noPool: String(m.noPool ?? '0'),
                        status: Number(m.status ?? 0),
                        closeTime: String(m.closeTime ?? 0),
                        marketType: typeof basicsMarketType === 'bigint' ? Number(basicsMarketType) : Number(basicsMarketType ?? 0),
                        paused: admin ? Boolean(admin.paused) : false,
                        disputeUsed: admin ? Boolean(admin.disputeUsed) : false,
                        disputeActive: admin ? Boolean(admin.disputeActive) : false,
                    };
                } catch (err) {
                    if (isDev) console.debug(`markets: fetch idx ${idx} failed`, String(err));
                    return null;
                }
            };

            const results = await mapWithConcurrency(indices, mapper, 6);
            const markets = results.filter(Boolean);

            perf.chainMs += msSince(tChain);

            // cache this page
            pageCache[cacheKey] = { ts: Date.now(), ttl: DEFAULT_TTL, data: markets, total };
            // write to redis if available
            try {
                const tRw = Date.now();
                const redis = await import('../../../lib/redisClient');
                await redis.setex(`markets:${cacheKey}`, Math.floor(DEFAULT_TTL / 1000), JSON.stringify({ markets, total }));
                perf.redisWriteMs += msSince(tRw);
            } catch {
                // ignore
            }
        })();

        inFlightByKey.set(cacheKey, work);
        capInFlight();
        try {
            await withTimeout(work, 20000, 'markets compute timed out');
        } finally {
            inFlightByKey.delete(cacheKey);
        }

        const finalMem = getInMemoryCached(cacheKey, Date.now(), { allowStale: true });
        if (finalMem) {
            perf.cache = `memory:${finalMem.kind}`;
            return jsonResponse(
                { markets: finalMem.data, total: finalMem.total, degraded: finalMem.kind === 'stale' },
                {
                    status: 200,
                    cacheControl: 'public, max-age=5',
                    extraHeaders: withPerf({ 'X-Markets-Cache': `memory:${finalMem.kind}` }),
                }
            );
        }
        const tFinalRedis = Date.now();
        const finalRedis = await getRedisCached(cacheKey);
        perf.redisMs += msSince(tFinalRedis);
        if (finalRedis) {
            perf.cache = 'redis';
            return jsonResponse(
                { ...finalRedis, degraded: true },
                {
                    status: 200,
                    cacheControl: 'public, max-age=5',
                    extraHeaders: withPerf({ 'X-Markets-Cache': 'redis' }),
                }
            );
        }

        perf.cache = 'fallback';
        return jsonResponse({ markets: [], total: 0 }, { status: 200, cacheControl: 'public, max-age=5', extraHeaders: withPerf({ 'X-Markets-Cache': 'fallback' }) });
    } catch (err) {
        console.error('API markets error', err);
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev) {
            let detail;
            try {
                const { redactLikelySecrets } = await import('../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }
            return jsonResponse({ error: 'Internal Server Error', detail }, { status: 500, cacheControl: 'no-store' });
        }
        return jsonResponse({ error: 'Internal Server Error' }, { status: 500, cacheControl: 'no-store' });
    }
}
