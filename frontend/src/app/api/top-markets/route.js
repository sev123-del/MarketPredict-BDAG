import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../configs/contractConfig';
import { redactUrlCredentials } from '../../../lib/redact';

// cache top markets
let topMarketsCache = { ts: 0, ttl: 10 * 1000, data: null };

export async function GET(req) {
    try {
        const isDev = process.env.NODE_ENV !== 'production';
        const rpc = process.env.BDAG_RPC || (isDev ? process.env.DEV_FALLBACK_RPC || '' : '');

        // Rate limit requests early
        try {
            const { checkRateLimit } = await import('../../../lib/rateLimit');
            const rl = await checkRateLimit(req);
            if (rl) return rl;
        } catch {
            // ignore rate limiter failures
        }

        if (!rpc) {
            if (isDev) {
                console.warn('top-markets: no RPC configured; returning empty list for resilience');
                const headers = new Headers();
                headers.set('Cache-Control', `public, max-age=5`);
                return new Response(JSON.stringify({ markets: [] }), { status: 200, headers });
            }
            // Production: fail loudly so deploys don't silently use a dev fallback.
            const headers = new Headers();
            headers.set('Content-Type', 'application/json; charset=utf-8');
            return new Response(JSON.stringify({ error: 'BDAG RPC not configured' }), { status: 502, headers });
        }

        // Log rpc presence (mask value in logs) only in development
        if (isDev && rpc) {
            try {
                console.info('top-markets: using rpc', redactUrlCredentials(rpc));
            } catch {
                console.info('top-markets: using rpc (masked)');
            }
        }

        const now = Date.now();
        // Try Redis-backed cache first
        try {
            const redis = await import('../../../lib/redisClient');
            const cached = await redis.get('top-markets');
            if (cached) {
                const parsed = JSON.parse(cached);
                const headers = new Headers();
                headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
                headers.set('Content-Type', 'application/json; charset=utf-8');
                return new Response(JSON.stringify({ markets: parsed }), { status: 200, headers });
            }
        } catch {
            // ignore redis failures and fall back to in-memory cache below
        }
        if (topMarketsCache.data && (now - topMarketsCache.ts) <= topMarketsCache.ttl) {
            const headers = new Headers();
            headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
            headers.set('Content-Type', 'application/json; charset=utf-8');
            return new Response(JSON.stringify({ markets: topMarketsCache.data }), { status: 200, headers });
        }

        const provider = new ethers.JsonRpcProvider(rpc);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        // helper: retry wrapper for flaky RPC calls
        const retry = async (fn, attempts = 3, delay = 300) => {
            let lastErr;
            for (let a = 0; a < attempts; a++) {
                try {
                    return await fn();
                } catch (e) {
                    lastErr = e;
                    if (a < attempts - 1) await new Promise((r) => setTimeout(r, delay));
                }
            }
            throw lastErr;
        };

        // safe market count
        let count = 0;
        try {
            const countBn = await retry(() => contract.marketCount());
            count = Number(countBn || 0);
        } catch (e) {
            if (isDev) console.warn('top-markets: marketCount failed', String(e));
            const headers = new Headers();
            headers.set('Cache-Control', `public, max-age=5`);
            return new Response(JSON.stringify({ markets: [] }), { status: 200, headers });
        }

        const markets = [];
        // batch reads with limited concurrency
        const concurrency = 8;
        const tasks = [];
        for (let i = 0; i < count; i++) {
            tasks.push(i);
        }

        const workers = new Array(concurrency).fill(null).map(async () => {
            while (tasks.length > 0) {
                const idx = tasks.shift();
                if (idx === undefined) break;
                try {
                    const m = await retry(() => contract.getMarket(idx));
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
        topMarketsCache = { ts: now, ttl: topMarketsCache.ttl, data: top };
        // write to redis if available
        try {
            const redis = await import('../../../lib/redisClient');
            await redis.setex('top-markets', Math.floor(topMarketsCache.ttl / 1000) || 10, JSON.stringify(top));
        } catch {
            // ignore
        }

        const headers = new Headers();
        headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
        headers.set('Content-Type', 'application/json; charset=utf-8');

        return new Response(JSON.stringify({ markets: top }), { status: 200, headers });
    } catch (err) {
        console.error('API top-markets error', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
}
