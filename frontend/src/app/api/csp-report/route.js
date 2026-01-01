export async function POST(req) {
    try {
        const { fetchWithTimeout } = await import('../../../lib/fetchServer');
        const isDev = process.env.NODE_ENV !== 'production';

        // Same-origin guard (prevents cross-site POST abuse in browsers).
        try {
            const { enforceSameOrigin } = await import('../../../lib/originGuard');
            const blocked = enforceSameOrigin(req);
            if (blocked) return blocked;
        } catch {
            // ignore origin guard failures
        }

        // Rate limit CSP reports to mitigate abuse.
        try {
            const { checkRateLimit } = await import('../../../lib/rateLimit');
            const rl = await checkRateLimit(req, { limit: 60, windowSeconds: 60 });
            if (rl) return rl;
        } catch {
            // ignore rate limiter failures
        }

        const baseHeaders = { 'Cache-Control': 'no-store' };

        const contentType = req.headers.get('content-type') || '';
        const contentLength = Number(req.headers.get('content-length') || '0');
        // Bound report sizes to mitigate memory/CPU abuse.
        if (Number.isFinite(contentLength) && contentLength > 100_000) {
            return new Response(null, { status: 413, headers: baseHeaders });
        }

        // Always read text first so size is bounded even when Content-Length is missing.
        const text = await req.text();
        const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
        if (bytes > 100_000) {
            return new Response(null, { status: 413, headers: baseHeaders });
        }

        // Accept JSON-based CSP reports and plain body payloads
        let payload;
        if (contentType.includes('application/json')) {
            try {
                payload = text ? JSON.parse(text) : {};
            } catch {
                // Malformed JSON: keep minimal payload
                payload = { raw: text.slice(0, 2000) };
            }
        } else {
            try {
                payload = text ? JSON.parse(text) : {};
            } catch {
                payload = { raw: text };
            }
        }

        const isPrivateHostname = (host) => {
            const h = String(host || '').toLowerCase();
            if (!h) return true;
            if (h === 'localhost' || h.endsWith('.local')) return true;
            // block common private ranges if hostname is an IPv4 literal
            if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) {
                if (h.startsWith('10.')) return true;
                if (h.startsWith('192.168.')) return true;
                if (h.startsWith('127.')) return true;
                const m = h.match(/^172\.(\d{1,3})\./);
                if (m) {
                    const n = Number(m[1]);
                    if (n >= 16 && n <= 31) return true;
                }
            }
            return false;
        };

        // In production forward to configured monitoring endpoint if present.
        try {
            const forwardUrl = process.env.CSP_REPORT_FORWARD_URL || '';
            if (forwardUrl) {
                let parsed;
                try {
                    parsed = new URL(forwardUrl);
                } catch {
                    parsed = null;
                }
                // SSRF hardening: require https and block private/localhost targets.
                if (!parsed || parsed.protocol !== 'https:' || isPrivateHostname(parsed.hostname)) {
                    // Misconfigured forwarder; do not forward.
                } else {
                    // Fire-and-forget forward — keep request responsive
                    try {
                        await fetchWithTimeout(forwardUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reportedAt: new Date().toISOString(), report: payload }),
                        }, 3000);
                    } catch (fwdErr) {
                        // swallow forward errors — do not fail the report endpoint
                        if (isDev) {
                            try {
                                const { redactLikelySecrets, redactUrlCredentials } = await import('../../../lib/redact');
                                const msg = redactLikelySecrets(redactUrlCredentials(String(fwdErr?.message || fwdErr)));
                                console.warn('CSP report forward failed (dev, redacted):', msg);
                            } catch {
                                console.warn('CSP report forward failed (dev):', String(fwdErr?.message || fwdErr));
                            }
                        } else {
                            try {
                                const { recordSecurityEvent } = await import('../../../lib/securityTelemetry');
                                recordSecurityEvent('api_error', { route: 'POST:/api/csp-report', kind: 'forward_failed' });
                            } catch {
                                // ignore
                            }
                        }
                    }
                }
            }

            // Avoid logging full CSP payloads (may contain URLs / user data).
            if (process.env.NODE_ENV === 'production') {
                console.info('CSP report received');
            } else {
                console.info('CSP report received (dev)');
            }
        } catch {
            // swallow logging errors
        }

        // Return no content to acknowledge receipt
        return new Response(null, { status: 204, headers: baseHeaders });
    } catch (err) {
        let detail;
        if (isDev) {
            try {
                const { redactLikelySecrets } = await import('../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }
        } else {
            try {
                const { recordSecurityEvent } = await import('../../../lib/securityTelemetry');
                recordSecurityEvent('api_error', { route: 'POST:/api/csp-report', kind: 'unhandled' });
            } catch {
                // ignore
            }
        }
        return new Response(JSON.stringify({ error: 'Internal Server Error', detail }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
}
