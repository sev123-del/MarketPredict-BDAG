Deployment CSP & Header Examples

Purpose: provide example headers for common hosting environments to enforce the Content Security Policy (CSP) you added in `frontend/src/app/layout.tsx` at the hosting layer. Enforcing CSP at the host is stronger than meta tags.

1) Vercel (vercel.json)

{
  "headers": [
    {
      "source": "(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
      ]
    }
  ]
}

2) Netlify (_headers)

/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

3) Nginx

add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;

Notes & Recommendations:
- Avoid enabling `unsafe-eval` or `unsafe-inline` for scripts; `style-src 'unsafe-inline'` is sometimes necessary for Tailwind/JIT—consider extracting critical styles and using hashed nonces where possible.
- For external API endpoints or third-party widgets, explicitly add their origins to `connect-src` or `img-src`.
- Use Subresource Integrity (SRI) for any third-party scripts/styles delivered from CDNs.
- Store any testnet RPCs or keys in GitHub Secrets (e.g., `FRONTEND_TESTNET_RPC`) and never commit them.
