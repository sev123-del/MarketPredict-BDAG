import { describe, it, expect } from 'vitest';
import { enforceSameOrigin } from '../src/lib/originGuard';

function makeReq(url: string, init?: { method?: string; origin?: string; xfHost?: string; xfProto?: string }) {
    const headers = new Headers();
    if (init?.origin) headers.set('origin', init.origin);
    if (init?.xfHost) headers.set('x-forwarded-host', init.xfHost);
    if (init?.xfProto) headers.set('x-forwarded-proto', init.xfProto);

    return new Request(url, {
        method: init?.method || 'POST',
        headers,
    });
}

describe('enforceSameOrigin', () => {
    it('allows same-origin POST', () => {
        const req = makeReq('https://example.com/api/route', { origin: 'https://example.com' });
        expect(enforceSameOrigin(req)).toBeNull();
    });

    it('blocks cross-origin POST', async () => {
        const req = makeReq('https://example.com/api/route', { origin: 'https://evil.com' });
        const res = enforceSameOrigin(req);
        expect(res).not.toBeNull();
        expect(res?.status).toBe(403);
    });

    it('allows forwarded origin when req.url origin differs', () => {
        // Simulate a proxy where req.url uses an internal host, but browser Origin is the public host.
        const req = makeReq('http://internal:3000/api/route', {
            origin: 'https://public.example.com',
            xfHost: 'public.example.com',
            xfProto: 'https',
        });
        expect(enforceSameOrigin(req)).toBeNull();
    });

    it('allows allowlisted origins', () => {
        const req = makeReq('https://example.com/api/route', { origin: 'https://preview.example.com' });
        expect(enforceSameOrigin(req, { allowedOrigins: 'https://preview.example.com' })).toBeNull();
    });
});
