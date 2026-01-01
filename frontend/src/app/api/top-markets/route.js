import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../configs/contractConfig';
import { redactUrlCredentials } from '../../../lib/redact';
import { withTimeout, retry as retryAsync } from '../../../lib/asyncServer';

// cache top markets
let topMarketsCache = { ts: 0, ttl: 60 * 1000, data: null };
const TOP_MARKETS_STALE_TTL_MS = 5 * 60 * 1000;
let topMarketsInFlight = null;

// Defense-in-depth: keep this endpoint bounded even if marketCount grows large.
const MAX_MARKETS_SCANNED = 5000;
const MAX_REDIS_TOP_MARKETS_BYTES = 200_000;

let selectedRpcCache = { ts: 0, url: null };
const SELECTED_RPC_TTL_MS = 60 * 1000;

function msSince(t0) {
    return Math.max(0, Date.now() - t0);
}

function formatServerTiming(entries) {
    return Object.entries(entries)
        .filter(([, v]) => Number.isFinite(v) && v >= 0)
        .map(([k, v]) => `${k};dur=${Math.round(v)}`)
        .join(', ');
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
        // In dev, Next sometimes provides relative URLs; fall back to Host header.
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
    return new Response(JSON.stringify(payload), { status, headers });
}

async function getRedisCachedTopMarkets() {
    try {
        const redis = await import('../../../lib/redisClient');
        const cached = await redis.get('top-markets');
        if (!cached) return null;
        if (typeof cached === 'string' && cached.length > MAX_REDIS_TOP_MARKETS_BYTES) return null;
        const parsed = JSON.parse(cached);
        if (!Array.isArray(parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function getInMemoryCachedTopMarkets(nowMs, { allowStale } = {}) {
    if (!topMarketsCache.data) return null;
    const age = nowMs - topMarketsCache.ts;
    if (age <= topMarketsCache.ttl) {
        return { markets: topMarketsCache.data, freshness: 'fresh' };
    }
    if (allowStale && age <= TOP_MARKETS_STALE_TTL_MS) {
        return { markets: topMarketsCache.data, freshness: 'stale' };
    }
    return null;
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
        const now = Date.now();

        const startComputeIfNeeded = ({ recordPerf } = { recordPerf: true }) => {
            if (topMarketsInFlight) return;

            topMarketsInFlight = (async () => {
                const { selectRpcUrl } = await import('../../../lib/rpcFailover');

                const cachedRpc =
                    selectedRpcCache.url && (Date.now() - selectedRpcCache.ts) <= SELECTED_RPC_TTL_MS
                        ? selectedRpcCache.url
                        : null;

                let rpc;
                if (cachedRpc) {
                    rpc = cachedRpc;
                } else {
                    const tRpc = Date.now();
                    rpc = await selectRpcUrl({ isDev, requiredContractAddress: CONTRACT_ADDRESS });
                    if (recordPerf) perf.rpcMs += msSince(tRpc);
                    if (rpc) selectedRpcCache = { ts: Date.now(), url: rpc };
                }

                if (!rpc) {
                    if (isDev) {
                        console.warn('top-markets: no RPC configured; caching empty list for resilience');
                        topMarketsCache = { ts: Date.now(), ttl: 10 * 1000, data: [] };
                        return;
                    }
                    // Production: no RPC configured; cache empty briefly to avoid stampede.
                    topMarketsCache = { ts: Date.now(), ttl: 10 * 1000, data: [] };
                    return;
                }

                const tChain = Date.now();

                // Log rpc presence (mask value in logs) only in development
                if (isDev && rpc) {
                    try {
                        console.info('top-markets: using rpc', redactUrlCredentials(rpc));
                    } catch {
                        console.info('top-markets: using rpc (masked)');
                    }
                }

                const provider = new ethers.JsonRpcProvider(rpc);
                const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

                // safe market count
                let count = 0;
                try {
                    const countBn = await retryAsync(
                        () => withTimeout(contract.marketCount(), 6000, 'RPC marketCount timed out'),
                        2,
                        200
                    );
                    count = Number(countBn || 0);
                } catch (e) {
                    if (isDev) console.warn('top-markets: marketCount failed', String(e));
                    topMarketsCache = { ts: Date.now(), ttl: 10 * 1000, data: [] };
                    return;
                }

                if (!Number.isFinite(count) || count <= 0) {
                    topMarketsCache = { ts: Date.now(), ttl: 10 * 1000, data: [] };
                    return;
                }

                const originalCount = count;
                if (count > MAX_MARKETS_SCANNED) {
                    count = MAX_MARKETS_SCANNED;
                    try {
                        const { recordSecurityEvent } = await import('../../../lib/securityTelemetry');
                        recordSecurityEvent('top_markets_clamped', { route: 'GET:/api/top-markets', kind: String(originalCount) });
                    } catch {
                        // ignore telemetry failures
                    }
                }

                const markets = [];
                // batch reads with limited concurrency
                const concurrency = 8;

                let nextIdx = 0;
                const workers = new Array(concurrency).fill(null).map(async () => {
                    while (true) {
                        const idx = nextIdx++;
                        if (idx >= count) break;
                        try {
                            const m = await retryAsync(
                                () => withTimeout(contract.getMarket(idx), 6000, 'RPC getMarket timed out'),
                                2,
                                200
                            );
                            const yesPool = Number(ethers.formatEther(m.yesPool || 0));
                            const noPool = Number(ethers.formatEther(m.noPool || 0));
                            const totalPool = yesPool + noPool;
                            const status = Number(m.status || 0);
                            if (status === 0 && totalPool > 0) {
                                markets.push({
                                    id: idx,
                                    question: m.question,
                                    yesPool: String(m.yesPool || '0'),
                                    noPool: String(m.noPool || '0'),
                                    status,
                                    closeTime: String(m.closeTime || 0),
                                });
                            }
                        } catch (e) {
                            // log in development only and continue
                            if (isDev) console.debug(`top-markets: getMarket(${idx}) failed:`, String(e));
                        }
                    }
                });

                await Promise.all(workers);

                markets.sort((a, b) => (Number(b.yesPool) + Number(b.noPool)) - (Number(a.yesPool) + Number(a.noPool)));
                const top = markets.slice(0, 3);
                topMarketsCache = { ts: Date.now(), ttl: topMarketsCache.ttl, data: top };
                if (recordPerf) perf.chainMs += msSince(tChain);

                // write to redis if available
                try {
                    const tRw = Date.now();
                    const redis = await import('../../../lib/redisClient');
                    await redis.setex('top-markets', Math.floor(topMarketsCache.ttl / 1000) || 60, JSON.stringify(top));
                    if (recordPerf) perf.redisWriteMs += msSince(tRw);
                } catch {
                    // ignore
                }
            })().finally(() => {
                topMarketsInFlight = null;
            });
        };

        // Serve cached responses first (avoid any RPC probing/work)
        const memCached = getInMemoryCachedTopMarkets(now);
        if (memCached) {
            perf.cache = `memory:${memCached.freshness}`;
            perf.memMs = msSince(tStart);
            return jsonResponse(
                { markets: memCached.markets },
                {
                    status: 200,
                    cacheControl: 'public, s-maxage=60, stale-while-revalidate=120',
                    extraHeaders: withPerf({ 'X-Top-Markets-Cache': `memory:${memCached.freshness}` }),
                }
            );
        }

        // Serve cached responses first (cached reads are cheap and shouldn't be rate-limited)
        const tRedis = Date.now();
        const redisCached = await getRedisCachedTopMarkets();
        perf.redisMs += msSince(tRedis);
        if (redisCached) {
            perf.cache = 'redis';
            return jsonResponse(
                { markets: redisCached },
                {
                    status: 200,
                    cacheControl: 'public, s-maxage=60, stale-while-revalidate=120',
                    extraHeaders: withPerf({ 'X-Top-Markets-Cache': 'redis' }),
                }
            );
        }

        // If another request is already computing, wait briefly and then serve cache.
        if (topMarketsInFlight) {
            const afterWaitMem = getInMemoryCachedTopMarkets(Date.now(), { allowStale: true });
            if (afterWaitMem) {
                perf.cache = `memory:${afterWaitMem.freshness}`;
                return jsonResponse(
                    { markets: afterWaitMem.markets, degraded: afterWaitMem.freshness === 'stale' },
                    {
                        status: 200,
                        cacheControl: 'public, max-age=5',
                        extraHeaders: withPerf({ 'X-Top-Markets-Cache': `memory:${afterWaitMem.freshness}`, 'X-Top-Markets-Coalesced': '1' }),
                    }
                );
            }

            const tWait = Date.now();
            try {
                await withTimeout(topMarketsInFlight, 8000, 'top-markets in-flight timed out');
            } catch {
                // ignore
            }
            perf.waitMs += msSince(tWait);

            const afterWaitMem2 = getInMemoryCachedTopMarkets(Date.now(), { allowStale: true });
            if (afterWaitMem2) {
                perf.cache = `memory:${afterWaitMem2.freshness}`;
                return jsonResponse(
                    { markets: afterWaitMem2.markets, degraded: afterWaitMem2.freshness === 'stale' },
                    {
                        status: 200,
                        cacheControl: 'public, max-age=5',
                        extraHeaders: withPerf({ 'X-Top-Markets-Cache': `memory:${afterWaitMem2.freshness}`, 'X-Top-Markets-Coalesced': '1' }),
                    }
                );
            }
            const tRedisAfterWait = Date.now();
            const afterWaitRedis = await getRedisCachedTopMarkets();
            perf.redisMs += msSince(tRedisAfterWait);
            if (afterWaitRedis) {
                perf.cache = 'redis';
                return jsonResponse(
                    { markets: afterWaitRedis, degraded: true },
                    {
                        status: 200,
                        cacheControl: 'public, max-age=5',
                        extraHeaders: withPerf({ 'X-Top-Markets-Cache': 'redis', 'X-Top-Markets-Coalesced': '1' }),
                    }
                );
            }
        }

        // If we have stale in-memory data, return it immediately and refresh in background.
        const staleMem = getInMemoryCachedTopMarkets(now, { allowStale: true });
        if (staleMem && staleMem.freshness === 'stale') {
            perf.cache = 'memory:stale';
            startComputeIfNeeded({ recordPerf: false });
            return jsonResponse(
                { markets: staleMem.markets, degraded: true },
                {
                    status: 200,
                    cacheControl: 'public, max-age=5',
                    extraHeaders: withPerf({ 'X-Top-Markets-Cache': 'memory:stale' }),
                }
            );
        }

        const isLocal = isDev || isLocalhostRequest(req);

        // Rate limit only when we would otherwise hit the chain.
        // Skip rate limiting for localhost/dev to avoid noisy 429s during iteration.
        if (!isLocal) {
            const tRl = Date.now();
            try {
                const { checkRateLimit } = await import('../../../lib/rateLimit');
                const rl = await checkRateLimit(req, { limit: 120, windowSeconds: 60, scope: 'GET:/api/top-markets' });
                if (rl) {
                    // Graceful degradation: if we have slightly stale data, serve it instead of 429.
                    const staleMem = getInMemoryCachedTopMarkets(Date.now(), { allowStale: true });
                    if (staleMem) {
                        perf.rlMs += msSince(tRl);
                        perf.cache = `memory:${staleMem.freshness}`;
                        return jsonResponse(
                            { markets: staleMem.markets, degraded: true },
                            {
                                status: 200,
                                cacheControl: 'public, max-age=5',
                                extraHeaders: withPerf({ 'X-Top-Markets-Cache': `memory:${staleMem.freshness}`, 'X-RateLimited': '1' }),
                            }
                        );
                    }
                    const tStaleRedis = Date.now();
                    const staleRedis = await getRedisCachedTopMarkets();
                    perf.redisMs += msSince(tStaleRedis);
                    if (staleRedis) {
                        perf.rlMs += msSince(tRl);
                        perf.cache = 'redis';
                        return jsonResponse(
                            { markets: staleRedis, degraded: true },
                            {
                                status: 200,
                                cacheControl: 'public, max-age=5',
                                extraHeaders: withPerf({ 'X-Top-Markets-Cache': 'redis', 'X-RateLimited': '1' }),
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

        // Singleflight: compute once, share across concurrent requests.
        startComputeIfNeeded({ recordPerf: true });

        try {
            const tWait2 = Date.now();
            await withTimeout(topMarketsInFlight, 15000, 'top-markets compute timed out');
            perf.waitMs += msSince(tWait2);
        } catch {
            // ignore; we'll return whatever cache we have
        }

        const computedMem = getInMemoryCachedTopMarkets(Date.now(), { allowStale: true });
        if (computedMem) {
            perf.cache = `memory:${computedMem.freshness}`;
            return jsonResponse(
                { markets: computedMem.markets, degraded: computedMem.freshness === 'stale' },
                {
                    status: 200,
                    cacheControl: 'public, max-age=5',
                    extraHeaders: withPerf({ 'X-Top-Markets-Cache': `memory:${computedMem.freshness}` }),
                }
            );
        }
        const tComputedRedis = Date.now();
        const computedRedis = await getRedisCachedTopMarkets();
        perf.redisMs += msSince(tComputedRedis);
        if (computedRedis) {
            perf.cache = 'redis';
            return jsonResponse(
                { markets: computedRedis, degraded: true },
                {
                    status: 200,
                    cacheControl: 'public, max-age=5',
                    extraHeaders: withPerf({ 'X-Top-Markets-Cache': 'redis' }),
                }
            );
        }

        // Last-resort fallback: keep the homepage working even if the chain is unhappy.
        perf.cache = 'fallback';
        return jsonResponse({ markets: [] }, { status: 200, cacheControl: 'public, max-age=5', extraHeaders: withPerf({ 'X-Top-Markets-Cache': 'fallback' }) });

        // Unreachable (response returned above after compute); keep as safety net.
        const safe = getInMemoryCachedTopMarkets(Date.now(), { allowStale: true });
        return jsonResponse({ markets: safe?.markets || [] }, { status: 200, cacheControl: 'public, max-age=5', extraHeaders: { 'X-Top-Markets-Cache': 'fallback:post' } });
    } catch (err) {
        const isDev = process.env.NODE_ENV !== 'production';
        let detail;
        if (isDev) {
            try {
                const { redactLikelySecrets } = await import('../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }

            console.warn('API top-markets error (dev, redacted):', detail);
        } else {
            // Prod: record low-noise telemetry only.
            try {
                const { recordSecurityEvent } = await import('../../../lib/securityTelemetry');
                recordSecurityEvent('api_error', { route: 'GET:/api/top-markets', kind: 'unhandled' });
            } catch {
                // ignore
            }
        }
        return jsonResponse({ error: 'Internal Server Error', detail }, { status: 500, cacheControl: 'no-store' });
    }
}
