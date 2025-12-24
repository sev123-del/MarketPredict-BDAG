export async function POST(req) {
    try {
        const contentType = req.headers.get('content-type') || '';
        // Accept JSON-based CSP reports and plain body payloads
        let payload;
        if (contentType.includes('application/json')) {
            payload = await req.json();
        } else {
            const text = await req.text();
            try {
                payload = JSON.parse(text);
            } catch {
                payload = { raw: text };
            }
        }

        // In production forward to configured monitoring endpoint if present.
        try {
            const forwardUrl = process.env.CSP_REPORT_FORWARD_URL || '';
            if (forwardUrl) {
                // Fire-and-forget forward — keep request responsive
                try {
                    await fetch(forwardUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reportedAt: new Date().toISOString(), report: payload }),
                    });
                } catch (fwdErr) {
                    // swallow forward errors — do not fail the report endpoint
                    console.warn('CSP report forward failed', String(fwdErr));
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
        return new Response(null, { status: 204 });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
