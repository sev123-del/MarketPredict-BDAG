/* eslint-disable no-console */

const { spawnSync } = require('node:child_process');

function isTruthy(v) {
    return String(v || '').trim().toLowerCase() === 'true';
}

function run(cmd, args, opts = {}) {
    const res = spawnSync(cmd, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: process.env,
        ...opts,
    });
    if (res.status !== 0) {
        throw new Error(`Command failed: ${cmd} ${(args || []).join(' ')}`);
    }
}

function main() {
    const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
    const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();

    // Only upload from production builds by default.
    // (Preview builds usually don't need sourcemaps, and tokens are often not present there.)
    const isProdBuild = vercelEnv === 'production' || (vercelEnv === '' && nodeEnv === 'production');

    const authToken = String(process.env.SENTRY_AUTH_TOKEN || '').trim();
    const org = String(process.env.SENTRY_ORG || '').trim();
    const project = String(process.env.SENTRY_PROJECT || '').trim();

    // Explicit opt-in flag to avoid generating/uploading sourcemaps unintentionally.
    const enabled = isTruthy(process.env.SENTRY_SOURCEMAPS);

    if (!enabled) {
        console.log('[sentry] sourcemaps disabled (set SENTRY_SOURCEMAPS=true to enable)');
        return;
    }

    if (!isProdBuild) {
        console.log(`[sentry] skipping sourcemap upload (not a production build; VERCEL_ENV=${vercelEnv || 'unset'} NODE_ENV=${nodeEnv || 'unset'})`);
        return;
    }

    if (!authToken || !org || !project) {
        console.log('[sentry] skipping sourcemap upload (missing SENTRY_AUTH_TOKEN and/or SENTRY_ORG and/or SENTRY_PROJECT)');
        return;
    }

    // Next.js emits client bundles under .next/static. We use the recommended debug-id flow:
    // 1) inject debug IDs
    // 2) upload the sourcemaps/bundles
    console.log('[sentry] injecting + uploading sourcemaps from .next ...');

    // Use the local @sentry/cli binary.
    run('npx', ['--no-install', 'sentry-cli', 'sourcemaps', 'inject', '.next']);

    // Upload all sourcemaps and JS bundles; url-prefix maps to Next's public path.
    run('npx', [
        '--no-install',
        'sentry-cli',
        'sourcemaps',
        'upload',
        '--url-prefix',
        '~/_next',
        '--validate',
        '.next',
    ]);

    console.log('[sentry] sourcemaps upload complete');
}

try {
    main();
} catch (err) {
    // Fail closed in production builds only if explicitly enabled.
    console.error('[sentry] sourcemap upload failed:', err && err.message ? err.message : String(err));
    process.exitCode = 1;
}
