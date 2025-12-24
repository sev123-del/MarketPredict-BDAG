const isDev = process.env.NODE_ENV !== 'production';

type LoggerLike = { debug?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
type SentryLike = { captureMessage?: (msg: string, opts?: Record<string, unknown>) => void; addBreadcrumb?: (b: { message: string }) => void; captureException?: (e: unknown, ctx?: Record<string, unknown>) => void };

let logger: LoggerLike | null = null;
let sentry: SentryLike | null = null;
try {
    // Only require Node-only logging libraries on the server to avoid bundling them
    if (typeof window === 'undefined') {
        // Use pino in production if available for structured logs; fallback to console
        if (!isDev) {
            // lazy require to avoid bundler resolving dev-only libs
            // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
            const pino = require('pino');
            logger = (pino && typeof pino === 'function') ? pino({ level: process.env.LOG_LEVEL || 'info' }) : null;
        }
    }
} catch {
    logger = null;
}

// Initialize Sentry if DSN is provided (server-side only)
try {
    // Initialize Sentry only on the server (avoid client-side bundling of @sentry/node)
    if (typeof window === 'undefined' && process.env.SENTRY_DSN) {
        // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const Sentry = require('@sentry/node');
        if (Sentry && typeof Sentry.init === 'function') Sentry.init({ dsn: process.env.SENTRY_DSN });
        sentry = Sentry;
    }
} catch {
    // ignore if @sentry/node is not installed
    sentry = null;
}

function sendToSentry(level: string, args: unknown[]) {
    if (!sentry) return;
    try {
        const [first, ...rest] = args;
        const message = typeof first === 'string' ? first : JSON.stringify(first as unknown);
        // capture as message for structured logs; attach extra args
        if (typeof sentry.captureMessage === 'function') sentry.captureMessage(message, { level } as Record<string, unknown>);
        if (rest && rest.length && typeof sentry.addBreadcrumb === 'function') sentry.addBreadcrumb({ message: JSON.stringify(rest as unknown) });
    } catch {
        // swallow
    }
}

export function debug(...args: unknown[]) {
    if (isDev) {
        // eslint-disable-next-line no-console
        console.debug(...(args as unknown[]));
    } else if (logger && typeof logger.debug === 'function') {
        logger.debug(...args);
    }
}

export function info(...args: unknown[]) {
    if (isDev) {
        // eslint-disable-next-line no-console
        console.info(...(args as unknown[]));
    } else if (logger && typeof logger.info === 'function') {
        logger.info(...args);
    }
}

export function warn(...args: unknown[]) {
    if (isDev) {
        // eslint-disable-next-line no-console
        console.warn(...(args as unknown[]));
    } else if (logger && typeof logger.warn === 'function') {
        logger.warn(...args);
    }
    sendToSentry('warning', args);
}

export function error(...args: unknown[]) {
    if (isDev) {
        // eslint-disable-next-line no-console
        console.error(...(args as unknown[]));
    } else if (logger && typeof logger.error === 'function') {
        logger.error(...args);
    }
    sendToSentry('error', args);
}

const defaultLogger = {
    debug,
    info,
    warn,
    error,
};

export default defaultLogger;
