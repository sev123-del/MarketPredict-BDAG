import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware to optionally enforce a strict per-request CSP with nonce.
// When CSP_STRICT=true, this generates a secure nonce and sets a
// Content-Security-Policy header that includes the nonce for script-src.
// Note: Make sure your server-rendered inline scripts include the nonce
// (header `x-csp-nonce` is provided for server components to consume).

export function middleware(req: NextRequest) {
  const enforce = process.env.CSP_STRICT === 'true';
  const isProd = process.env.NODE_ENV === 'production';

  const resHeaders = new Headers();
  // Baseline security headers (safe even when CSP not enforced)
  if (isProd) {
    resHeaders.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  resHeaders.set('X-Frame-Options', 'DENY');
  resHeaders.set('X-Content-Type-Options', 'nosniff');
  resHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  resHeaders.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
  resHeaders.set('X-Permitted-Cross-Domain-Policies', 'none');
  // Modern isolation hardening (keep allow-popups for wallet flows).
  resHeaders.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  resHeaders.set('Origin-Agent-Cluster', '?1');

  // Avoid applying CSP to static assets and internal Next paths.
  // Baseline security headers still apply.
  const pathname = req.nextUrl?.pathname || new URL(req.url).pathname;
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/')
  ) {
    const res = NextResponse.next();
    resHeaders.forEach((value, key) => res.headers.set(key, value));
    return res;
  }

  if (!enforce) {
    const res = NextResponse.next();
    resHeaders.forEach((value, key) => res.headers.set(key, value));
    return res;
  }

  // Use Web Crypto API in Edge runtime to generate nonce
  const rand = new Uint8Array(16);
  // `crypto` is available in Edge runtime
  (globalThis.crypto || (globalThis as any).webcrypto).getRandomValues(rand);
  let nonce: string;
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    nonce = Buffer.from(rand).toString('base64');
  } else {
    // browser btoa fallback
    const binary = Array.from(rand).map((b) => String.fromCharCode(b)).join('');
    nonce = globalThis.btoa(binary);
  }

  const reportGroupName = 'csp-endpoint';
  const scriptSrc = `script-src 'self' 'nonce-${nonce}'`;
  const cspDirectives = [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https: wss:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isProd ? [`upgrade-insecure-requests`] : []),
    `report-to ${reportGroupName}`,
  ];
  const csp = cspDirectives.join('; ') + ';';

  // Set CSP on the response and also attach the nonce to the *request*
  // headers so server components (via next/headers) can read it during render.
  resHeaders.set('Content-Security-Policy', csp);
  resHeaders.set('x-csp-nonce', nonce);

  // `Report-To` requires absolute URLs; only set if base URL is configured.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  if (baseUrl) {
    resHeaders.set(
      'Report-To',
      JSON.stringify({
        group: reportGroupName,
        max_age: 10886400,
        endpoints: [{ url: `${baseUrl.replace(/\/$/, '')}/api/csp-report` }],
        include_subdomains: true,
      })
    );
  }

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-csp-nonce', nonce);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  resHeaders.forEach((value, key) => res.headers.set(key, value));
  return res;
}

export const config = {
  matcher: '/(.*)',
};
