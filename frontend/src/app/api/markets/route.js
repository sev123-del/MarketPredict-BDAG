import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../configs/contractConfig';
import { redactUrlCredentials } from '../../../lib/redact';
import { withTimeout, retry as retryAsync } from '../../../lib/asyncServer';

// Safely stringify objects that may contain BigInt values
function safeStringify(obj) {
    return JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
}

// Page-keyed in-memory cache for serverless instance lifetime
let pageCache = {}; // { '<page>-<limit>': { ts, ttl, data, total } }
const DEFAULT_TTL = 15 * 1000;

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
                console.warn('markets: no RPC configured; returning empty page for resilience');
            } else {
                const headers = new Headers();
                headers.set('Content-Type', 'application/json; charset=utf-8');
                headers.set('Cache-Control', 'no-store');
                return new Response(safeStringify({ error: 'BDAG RPC not configured' }), { status: 502, headers });
            }
        }

        if (isDev && rpc) {
            try {
                console.info('markets: using rpc', redactUrlCredentials(rpc));
            } catch {
                console.info('markets: using rpc (masked)');
            }
        }

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
        // Try Redis-backed cache first
        try {
            const redis = await import('../../../lib/redisClient');
            const cached = await redis.get(`markets:${cacheKey}`);
            if (cached) {
                const parsed = JSON.parse(cached);
                const headers = new Headers();
                headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
                headers.set('Content-Type', 'application/json; charset=utf-8');
                return new Response(safeStringify(parsed), { status: 200, headers });
            }
        } catch {
            // ignore redis failures and fall back to in-memory cache below
        }

        const cached = pageCache[cacheKey];
        if (cached && (now - cached.ts) <= cached.ttl) {
            const headers = new Headers();
            headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
            headers.set('Content-Type', 'application/json; charset=utf-8');
            return new Response(safeStringify({ markets: cached.data, total: cached.total }), { status: 200, headers });
        }

        let provider;
        try {
            provider = new ethers.JsonRpcProvider(rpc);
        } catch (provErr) {
            if (isDev) console.error('markets: failed to create provider', provErr);
            const headers = new Headers();
            headers.set('Content-Type', 'application/json; charset=utf-8');
            headers.set('Cache-Control', 'no-store');
            return new Response(safeStringify({ error: 'Failed to create RPC provider', detail: isDev ? String(provErr) : undefined }), { status: 502, headers });
        }

        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        // get total market count (single value, cached lightly)
        let total = 0;
        try {
            const countBn = await retryAsync(() => withTimeout(contract.marketCount(), 8000, 'RPC marketCount timed out'));
            total = Number(countBn || 0);
        } catch (countErr) {
            if (isDev) console.error('markets: marketCount() failed', countErr);
            const headers = new Headers();
            headers.set('Content-Type', 'application/json; charset=utf-8');
            headers.set('Cache-Control', 'no-store');
            return new Response(safeStringify({ error: 'Failed to read marketCount', detail: isDev ? String(countErr) : undefined }), { status: 502, headers });
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
                return {
                    id: idx,
                    question: m.question,
                    yesPool: String(m.yesPool ?? '0'),
                    noPool: String(m.noPool ?? '0'),
                    status: Number(m.status ?? 0),
                    closeTime: String(m.closeTime ?? 0),
                    ...basics
                };
            } catch (err) {
                if (isDev) console.debug(`markets: fetch idx ${idx} failed`, String(err));
                return null;
            }
        };

        const results = await mapWithConcurrency(indices, mapper, 6);
        const markets = results.filter(Boolean);

        // cache this page
        pageCache[cacheKey] = { ts: now, ttl: DEFAULT_TTL, data: markets, total };
        // write to redis if available
        try {
            const redis = await import('../../../lib/redisClient');
            await redis.setex(`markets:${cacheKey}`, Math.floor(DEFAULT_TTL / 1000), JSON.stringify({ markets, total }));
        } catch {
            // ignore
        }

        const headers = new Headers();
        headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
        headers.set('Content-Type', 'application/json; charset=utf-8');

        return new Response(safeStringify({ markets, total }), { status: 200, headers });
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
            const headers = new Headers();
            headers.set('Content-Type', 'application/json; charset=utf-8');
            headers.set('Cache-Control', 'no-store');
            return new Response(safeStringify({ error: 'Internal Server Error', detail }), { status: 500, headers });
        }
        const headers = new Headers();
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.set('Cache-Control', 'no-store');
        return new Response(safeStringify({ error: 'Internal Server Error' }), { status: 500, headers });
    }
}
