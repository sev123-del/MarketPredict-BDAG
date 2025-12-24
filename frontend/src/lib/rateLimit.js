// Unified server-side rate limiter utility
// - Redis-first; in-memory Map fallback for single-instance dev/testing
// - Exports `checkRateLimit(req, opts)` and `resetInMemoryLimits()`

const DEFAULT_LIMIT = 60; // requests
const DEFAULT_WINDOW = 60; // seconds

let inMemoryStore = new Map();

function getIpFromRequest(req) {
    try {
        const fwd = req.headers.get('x-forwarded-for');
        if (fwd) return String(fwd).split(',')[0].trim();
        const real = req.headers.get('x-real-ip');
        if (real) return String(real).trim();
        try {
            const anyReq = req;
            if (anyReq.ip) return String(anyReq.ip);
        } catch { }
    } catch { }
    return 'unknown';
}

async function checkRedisLimit(redis, key, windowSeconds) {
    const val = await redis.incr(key);
    if (val === 1) {
        await redis.expire(key, windowSeconds);
    }
    return Number(val);
}

export async function checkRateLimit(req, opts = {}) {
    const limit = opts.limit || DEFAULT_LIMIT;
    const windowSeconds = opts.windowSeconds || DEFAULT_WINDOW;

    const ip = getIpFromRequest(req) || 'unknown';
    const key = `ratelimit:${ip}`;

    try {
        const redisMod = await import('../lib/redisClient').catch(() => null);
        if (redisMod && redisMod.default) {
            const redis = redisMod.default;
            const count = await checkRedisLimit(redis, key, windowSeconds);
            if (count > limit) {
                const headers = new Headers();
                headers.set('Content-Type', 'application/json; charset=utf-8');
                headers.set('Retry-After', String(windowSeconds));
                return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers });
            }
            return null;
        }
    } catch (e) {
        console.warn('rateLimit: redis check failed, falling back to in-memory', e?.message ?? e);
    }

    const now = Math.floor(Date.now() / 1000);
    const rec = inMemoryStore.get(key) || { count: 0, ts: now };
    if (now - rec.ts >= windowSeconds) {
        rec.count = 1;
        rec.ts = now;
    } else {
        rec.count = (rec.count || 0) + 1;
    }
    inMemoryStore.set(key, rec);
    if (rec.count > limit) {
        const headers = new Headers();
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.set('Retry-After', String(windowSeconds - (now - rec.ts)));
        return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers });
    }

    return null;
}

export function resetInMemoryLimits() {
    inMemoryStore = new Map();
}

export default { checkRateLimit, resetInMemoryLimits };
