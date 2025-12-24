const path = require("path");

module.exports = {
  // Prevent generating browser source maps in production (reduces CSP eval traces)
  productionBrowserSourceMaps: false,
  webpack: (config, { dev, isServer }) => {
    // Prevent libraries from trying to use node fs/path in browser
    config.resolve.fallback = {
      fs: false,
      path: require.resolve("path-browserify"),
      porto: false,
      "@react-native-async-storage/async-storage": false, // prevent SDK error
    };

    // In dev the default devtool can use eval() (e.g. eval-source-map).
    // Disable devtool to avoid runtime eval usage which triggers strict CSP.
    if (dev && !isServer) {
      config.devtool = false;
    }

    return config;
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    // Use strict CSP only when explicitly enabled via env var in production.
    // By default we use report-only to avoid blocking framework/runtime inline scripts
    // while nonces/hashes are being implemented. Set CSP_STRICT=true to enforce.
    // Use report-only by default to avoid blocking framework/runtime inline
    // scripts (hydration, websocket) which are required for client components.
    // Setting `CSP_STRICT=true` will enforce the policy (use with nonces/hashes).
    const isProd = process.env.NODE_ENV === 'production';
    const enforceCSP = process.env.CSP_STRICT === 'true';

    // Add report-to directive name to CSP so browsers can POST reports to our endpoint
    const reportGroupName = 'csp-endpoint';
    // Allow external CDN used for ethers; include it in both report-only and enforced modes.
    const cdnHosts = [
      'https://cdn.jsdelivr.net'
    ];
    const cdnList = cdnHosts.join(' ');
    const scriptSrc = enforceCSP
      ? `script-src 'self' ${cdnList}`
      : `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${cdnList}`;
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
      `report-to ${reportGroupName}`
    ];

    const csp = cspDirectives.join('; ') + ';';

    // Build core security headers (exclude CSP here when strict mode is enabled)
    const baseHeaders = [
      // Small security headers to improve overall posture
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Enforce HTTPS in production
      ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
    ];

    // When strict CSP is enabled we rely on middleware to inject a per-request
    // nonce and set the exact CSP header. The static header here would conflict
    // with per-request nonces, so we omit it in that mode.
    if (!enforceCSP) {
      // Report-only mode: add a static Report-Only CSP so we can collect reports
      // while we roll out nonces and hashed inline scripts.
      return [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'Content-Security-Policy-Report-Only',
              value: csp,
            },
            // Provide a Report-To header that instructs browsers where to send reports
            {
              key: 'Report-To',
              value: JSON.stringify({
                group: reportGroupName,
                max_age: 10886400,
                endpoints: [{ url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/csp-report` }],
                include_subdomains: true,
              }),
            },
            ...baseHeaders,
          ],
        },
      ];
    }

    // Strict mode: omit CSP here and let middleware set per-request CSP with nonce.
    return [
      {
        source: '/(.*)',
        headers: baseHeaders,
      },
    ];
  },
};
