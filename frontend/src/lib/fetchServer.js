// Server-side fetch helpers (Next.js route handlers)

function toUrlString(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input === 'object') {
        // URL
        if (typeof input.href === 'string') return input.href;
        // Request
        if (typeof input.url === 'string') return input.url;
    }
    return '';
}

function assertHttpUrl(input) {
    const s = toUrlString(input);
    if (!s) throw new Error('Invalid URL');
    let u;
    try {
        u = new URL(s);
    } catch {
        // Intentionally disallow relative URLs in this helper.
        throw new Error('fetchWithTimeout requires an absolute http(s) URL');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('fetchWithTimeout only supports http(s) URLs');
    }
}

function linkAbortSignals(fromSignal, toController) {
    if (!fromSignal) return;
    if (fromSignal.aborted) {
        try {
            toController.abort(fromSignal.reason);
        } catch {
            toController.abort();
        }
        return;
    }

    const onAbort = () => {
        try {
            toController.abort(fromSignal.reason);
        } catch {
            toController.abort();
        }
    };

    try {
        fromSignal.addEventListener('abort', onAbort, { once: true });
    } catch {
        // ignore
    }
}

export async function fetchWithTimeout(url, init = {}, timeoutMs = 8000) {
    assertHttpUrl(url);

    const controller = new AbortController();
    linkAbortSignals(init?.signal, controller);

    const timeoutId = setTimeout(() => {
        try {
            controller.abort(new Error('Fetch timed out'));
        } catch {
            controller.abort();
        }
    }, timeoutMs);

    try {
        const redirect = init && typeof init === 'object' && 'redirect' in init ? init.redirect : undefined;
        // Security default: never follow redirects automatically.
        const effectiveInit = { ...init, redirect: redirect ?? 'manual', signal: controller.signal };
        return await fetch(url, effectiveInit);
    } finally {
        clearTimeout(timeoutId);
    }
}
