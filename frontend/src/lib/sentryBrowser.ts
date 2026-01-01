import * as Sentry from '@sentry/browser';

let initialized = false;

export function initSentryBrowser() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export default Sentry;
