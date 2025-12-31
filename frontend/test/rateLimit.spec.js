import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('checkRateLimit (Redis-backed and in-memory)', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('uses Redis when available and blocks after limit', async () => {
        const makeReq = (ip) => ({ headers: { get: (k) => (k === 'x-forwarded-for' || k === 'x-real-ip' ? ip : null) } });

        vi.mock('../src/lib/redisClient', () => {
            const store = new Map();
            return {
                default: {
                    incr: async (k) => {
                        const v = (store.get(k) || 0) + 1;
                        store.set(k, v);
                        return v;
                    },
                    expire: async () => 1,
                },
            };
        });

        const { checkRateLimit } = await import('../src/lib/rateLimit.js');

        const req = makeReq('1.2.3.4');
        const opts = { limit: 2, windowSeconds: 60 };
        expect(await checkRateLimit(req, opts)).toBeNull();
        expect(await checkRateLimit(req, opts)).toBeNull();
        const res = await checkRateLimit(req, opts);
        expect(res).not.toBeNull();
        expect(res.status).toBe(429);
    });

    it('falls back to in-memory when redis client not present', async () => {
        const makeReq = (ip) => ({ headers: { get: (k) => (k === 'x-forwarded-for' || k === 'x-real-ip' ? ip : null) } });

        vi.mock('../src/lib/redisClient', () => ({ default: null }));

        const { checkRateLimit, resetInMemoryLimits } = await import('../src/lib/rateLimit.js');
        resetInMemoryLimits();

        const req = makeReq('5.6.7.8');
        const opts = { limit: 2, windowSeconds: 60 };
        expect(await checkRateLimit(req, opts)).toBeNull();
        expect(await checkRateLimit(req, opts)).toBeNull();
        const res = await checkRateLimit(req, opts);
        expect(res).not.toBeNull();
        expect(res.status).toBe(429);
    });
});
