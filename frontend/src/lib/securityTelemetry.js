// Minimal security telemetry counters (server-side only)
// Goal: detect abuse/degraded upstreams without adding new public endpoints.

const isServer = typeof window === 'undefined';
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// Opt-in only. Avoid unexpected logging/edge-runtime import issues.
const enabled = isServer && !isTest && process.env.ENABLE_SECURITY_TELEMETRY === 'true';

const counters = new Map();
let flushTimer = null;

function clampLabel(v, maxLen = 64) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    return s.slice(0, maxLen).replace(/\s+/g, '_');
}

async function logInfo(payload) {
    try {
        const mod = await import('./logger');
        if (mod && typeof mod.info === 'function') {
            mod.info(payload);
            return;
        }
    } catch {
        // ignore
    }
    // eslint-disable-next-line no-console
    console.info(payload);
}

async function addSentryBreadcrumb(payload) {
    // Best-practice: keep this low-noise. Breadcrumbs only attach to future errors.
    if (process.env.ENABLE_SECURITY_TELEMETRY_SENTRY !== 'true') return;
    if (!process.env.SENTRY_DSN) return;
    try {
        const SentryMod = await import('@sentry/node').catch(() => null);
        const Sentry = SentryMod && (SentryMod.default || SentryMod);
        if (!Sentry || typeof Sentry.addBreadcrumb !== 'function') return;

        Sentry.addBreadcrumb({
            category: 'security',
            level: 'info',
            message: 'security_telemetry_flush',
            data: payload,
        });
    } catch {
        // ignore
    }
}

export function recordSecurityEvent(eventName, tags = {}) {
    if (!enabled) return;

    const name = clampLabel(eventName, 48);
    if (!name) return;

    const route = clampLabel(tags.route, 80);
    const kind = clampLabel(tags.kind, 24);
    const label = clampLabel(tags.label, 80);

    // Keep cardinality low: only a few dimensions.
    const key = `${name}|${route}|${kind}|${label}`;
    counters.set(key, (counters.get(key) || 0) + 1);

    if (!flushTimer) {
        flushTimer = setTimeout(() => {
            flushTimer = null;
            flushSecurityTelemetry().catch(() => { });
        }, 60_000);
        // best-effort: don't keep the process alive for telemetry
        try {
            flushTimer.unref?.();
        } catch {
            // ignore
        }
    }
}

export async function flushSecurityTelemetry() {
    if (!enabled) return;
    if (counters.size === 0) return;

    const out = [];
    for (const [k, v] of counters.entries()) {
        out.push({ k, v });
    }
    counters.clear();

    // Keep payload bounded and predictable.
    const sorted = out.sort((a, b) => (b.v || 0) - (a.v || 0));
    const samples = sorted.slice(0, 50);
    const totalCount = sorted.reduce((acc, it) => acc + (Number(it.v) || 0), 0);
    const payload = {
        type: 'security_telemetry',
        at: new Date().toISOString(),
        uniqueKeys: sorted.length,
        totalCount,
        samples,
    };

    await logInfo(payload);
    await addSentryBreadcrumb(payload);
}
