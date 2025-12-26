import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN || '';
let initialized = false;

export function initSentry() {
    if (!dsn || initialized) return;
    Sentry.init({ dsn, tracesSampleRate: 0.1, environment: process.env.NODE_ENV });
    initialized = true;
}

export function captureException(err: unknown, ctx?: Record<string, unknown>) {
    try {
        if (!initialized) initSentry();
        Sentry.captureException(err as Error, { tags: { route: (ctx && (ctx.route as string)) || 'unknown' }, extra: ctx });
    } catch (e) {
        // swallow - don't let reporting break the app
        // eslint-disable-next-line no-console
        console.warn('Sentry capture failed', e);
    }
}

export default Sentry;
