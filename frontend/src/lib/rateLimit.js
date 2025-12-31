// Unified server-side rate limiter utility
// - Redis-first; in-memory Map fallback for single-instance dev/testing
// - Exports `checkRateLimit(req, opts)` and `resetInMemoryLimits()`

const DEFAULT_LIMIT = 60; // requests
const DEFAULT_WINDOW = 60; // seconds

let inMemoryStore = new Map();

let telemetryModPromise = null;
async function recordSecurityEventSafe(eventName, tags) {
    try {
        telemetryModPromise = telemetryModPromise || import('./securityTelemetry').catch(() => null);
        const mod = await telemetryModPromise;
        if (mod && typeof mod.recordSecurityEvent === 'function') {
            mod.recordSecurityEvent(eventName, tags);
        }
    } catch {
        // ignore
    }
}

function getIpFromRequest(req) {
    try {
        // Prefer CDN/proxy-provided canonical client IP headers when present.
        const cf = req.headers.get('cf-connecting-ip');
        if (cf) return String(cf).trim();
        const tci = req.headers.get('true-client-ip');
        if (tci) return String(tci).trim();
        const fly = req.headers.get('fly-client-ip');
        if (fly) return String(fly).trim();
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

function sanitizeIp(ip) {
    // Avoid letting header garbage create unbounded Redis keys.
    // Keep common IPv4/IPv6 characters only.
    const cleaned = String(ip || '').trim().slice(0, 128);
    const safe = cleaned.replace(/[^0-9a-fA-F:\.\[\]%\-]/g, '');
    return safe || 'unknown';
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

    // Scope rate limits per endpoint by default (method + pathname).
    // Falls back to a global bucket when URL isn't available (e.g., unit tests).
    let scope = typeof opts.scope === 'string' && opts.scope.trim() ? opts.scope.trim() : '';
    if (!scope) {
        try {
            const u = typeof req?.url === 'string' ? new URL(req.url) : null;
            const pathname = u?.pathname || '';
            const method = String(req?.method || 'GET').toUpperCase();
            scope = pathname ? `${method}:${pathname}` : 'global';
        } catch {
            scope = 'global';
        }
    }

    const ip = sanitizeIp(getIpFromRequest(req));
    const key = `ratelimit:${scope}:${ip}`;

    try {
        const redisMod = await import('../lib/redisClient').catch(() => null);
        if (redisMod && redisMod.default) {
            const redis = redisMod.default;
            const count = await checkRedisLimit(redis, key, windowSeconds);
            if (count > limit) {
                recordSecurityEventSafe('rate_limited', { route: scope, kind: 'redis' });
                const headers = new Headers();
                headers.set('Content-Type', 'application/json; charset=utf-8');
                headers.set('Retry-After', String(windowSeconds));
                headers.set('Cache-Control', 'no-store');
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
        recordSecurityEventSafe('rate_limited', { route: scope, kind: 'memory' });
        const headers = new Headers();
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.set('Retry-After', String(windowSeconds - (now - rec.ts)));
        headers.set('Cache-Control', 'no-store');
        return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers });
    }

    return null;
}

export function resetInMemoryLimits() {
    inMemoryStore = new Map();
}

const rateLimit = { checkRateLimit, resetInMemoryLimits };
export default rateLimit;
