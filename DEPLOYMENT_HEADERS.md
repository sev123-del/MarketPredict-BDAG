Deployment CSP & Header Examples

Purpose: provide example headers for common hosting environments.

This repo already sets baseline security headers in the app:
- Default: `frontend/next.config.js` emits `Content-Security-Policy-Report-Only` plus other baseline security headers.
- Optional strict mode: `frontend/middleware.ts` can enforce a per-request nonce-based CSP when `CSP_STRICT=true`.

If you deploy the app as-is, you generally should NOT also add a separate host-level `Content-Security-Policy` header, because it can conflict with the middleware nonce-based CSP.

Use the examples below only if you intentionally want to manage CSP at the hosting layer (or you are not using strict nonce mode).

1) Vercel (vercel.json)

Note: If you rely on `next.config.js` / middleware headers, you do not need `vercel.json` headers for CSP.

{
  "headers": [
    {
      "source": "(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy-Report-Only",
          "value": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-to csp-endpoint"
        }
      ]
    }
  ]
}

2) Netlify (_headers)

/*
  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-to csp-endpoint

3) Nginx

add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-to csp-endpoint" always;

# In production you may additionally want:
# add_header Content-Security-Policy-Report-Only "...; upgrade-insecure-requests; ..." always;

# If you want browsers to actually send CSP reports, you must also provide a Report-To header.
# IMPORTANT: The report endpoint URL must be absolute.
# Example:
# add_header Report-To '{"group":"csp-endpoint","max_age":10886400,"endpoints":[{"url":"https://YOUR_DOMAIN/api/csp-report"}],"include_subdomains":true}' always;

Notes & Recommendations:
- Avoid enabling `unsafe-eval` or `unsafe-inline` for scripts; `style-src 'unsafe-inline'` is sometimes necessary for Tailwind/JIT—consider extracting critical styles and using hashed nonces where possible.
- For external API endpoints or third-party widgets, explicitly add their origins to `connect-src` or `img-src`.
- Use Subresource Integrity (SRI) for any third-party scripts/styles delivered from CDNs.
- Store any testnet RPCs or keys in GitHub Secrets (e.g., `FRONTEND_TESTNET_RPC`) and never commit them.

App behavior notes:
- By default this repo emits `Content-Security-Policy-Report-Only` from `frontend/next.config.js` and includes `report-to csp-endpoint`.
- The `Report-To` header is emitted only when `NEXT_PUBLIC_BASE_URL` is set (it must be an absolute URL like `https://example.com`). Without it, browsers have no destination to POST CSP reports.
- When `CSP_STRICT=true`, CSP is enforced per-request in `frontend/middleware.ts` (nonce-based). Avoid setting a separate host-level CSP in that mode.
