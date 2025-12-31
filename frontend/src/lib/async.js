export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves/rejects with the original promise, but fails fast after `ms`.
 * Note: this does not cancel the underlying work (ethers calls are not abortable).
 */
export function withTimeout(promise, ms = 8000, message = 'Request timed out') {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
}

export async function retry(fn, attempts = 3, delayMs = 300) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            if (i < attempts - 1) await sleep(delayMs);
        }
    }
    throw lastErr;
}
