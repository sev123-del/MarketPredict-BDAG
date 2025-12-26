export function redactUrlCredentials(raw: unknown): string {
    const input = typeof raw === 'string' ? raw : String(raw ?? '');
    if (!input) return '';

    // Mask userinfo in URLs: scheme://user:pass@host -> scheme://****@host
    // Also handles scheme://token@host
    try {
        return input.replace(/(^\w+:\/\/)([^@\s/]+@)?/g, (_m, scheme) => `${scheme}****@`);
    } catch {
        return '[redacted]';
    }
}

export function redactLikelySecrets(raw: unknown): string {
    const input = typeof raw === 'string' ? raw : String(raw ?? '');
    if (!input) return '';

    // Conservative redactions for common secret patterns.
    // Note: keep minimal to avoid breaking useful error logs.
    return input
        // URLs with embedded credentials
        .replace(/(^\w+:\/\/)([^@\s/]+@)/g, '$1****@')
        // Long tokens/keys (very rough heuristic)
        .replace(/\b([A-Za-z0-9_\-]{24,})\b/g, '****');
}
