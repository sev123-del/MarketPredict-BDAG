import { sleep, withTimeout as baseWithTimeout } from './async';
import { recordSecurityEvent } from './securityTelemetry';

/**
 * Server-only wrappers around async helpers that add minimal security telemetry.
 * Intentionally NOT used in client bundles.
 */

export function withTimeout(promise, ms = 8000, message = 'Request timed out') {
    return baseWithTimeout(promise, ms, message)
        .catch((err) => {
            try {
                recordSecurityEvent('timeout', { kind: 'rpc', label: message });
            } catch {
                // ignore
            }
            throw err;
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

    try {
        recordSecurityEvent('retry_failed', { kind: 'rpc', label: String(attempts) });
    } catch {
        // ignore
    }

    throw lastErr;
}

export { sleep };
