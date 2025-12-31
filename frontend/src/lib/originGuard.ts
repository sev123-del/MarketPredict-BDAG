export type OriginGuardOptions = {
    /**
     * If set, only allow these origins (comma-separated). Otherwise allow request origin.
     * Example: "https://example.com,https://www.example.com"
     */
    allowedOrigins?: string;
};

function normalizeAllowedOrigins(raw: string): Set<string> {
    return new Set(
        raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    );
}

function firstHeaderValue(v: string | null): string {
    if (!v) return '';
    return v.split(',')[0]?.trim() || '';
}

function computeEffectiveOrigins(req: Request): Set<string> {
    const origins = new Set<string>();

    // 1) Direct origin from req.url
    try {
        origins.add(new URL(req.url).origin);
    } catch {
        // ignore
    }

    // 2) Proxy-aware origin from forwarded headers (common on Vercel/CDNs)
    const xfHost = firstHeaderValue(req.headers.get('x-forwarded-host'));
    const xfProto = firstHeaderValue(req.headers.get('x-forwarded-proto'));
    if (xfHost) {
        const proto = xfProto || 'https';
        origins.add(`${proto}://${xfHost}`);
    }

    return origins;
}

/**
 * Enforce same-origin for browser-initiated POST/PUT/PATCH/DELETE requests.
 *
 * - If Origin is missing, allow (server-to-server / non-browser).
 * - If Origin is present, require it matches request URL origin or is in allowlist.
 */
export function enforceSameOrigin(req: Request, opts: OriginGuardOptions = {}): Response | null {
    const method = String((req as unknown as { method?: string })?.method || 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;

    const origin = req.headers.get('origin');
    if (!origin) return null;

    let requestOrigin: string;
    try {
        requestOrigin = new URL(req.url).origin;
    } catch {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
            },
        });
    }

    const effectiveOrigins = computeEffectiveOrigins(req);
    effectiveOrigins.add(requestOrigin);

    const allowlistRaw = opts.allowedOrigins || process.env.ALLOWED_ORIGINS || '';
    if (allowlistRaw.trim()) {
        const allowed = normalizeAllowedOrigins(allowlistRaw);
        // Allow if explicitly allowlisted OR matches the effective request origin.
        if (!allowed.has(origin) && !effectiveOrigins.has(origin)) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                status: 403,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                },
            });
        }
        return null;
    }

    // No allowlist: require same-origin (proxy-aware).
    if (!effectiveOrigins.has(origin)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
            },
        });
    }

    return null;
}
