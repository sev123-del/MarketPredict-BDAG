# Optional Security Upgrades (Keep Handy)

This repo already includes a broad 2025 hardening pass (rate limiting, same-origin guards for browser writes, bounded request parsing, log redaction, CSP baseline + optional strict nonce CSP, SSRF-hardening for CSP forwarding, etc.).

This document answers common operational questions and keeps a short list of *optional* next upgrades.

---

## CSP Reports: Do we have “zero unexpected violations”?

**Not knowable from the repo alone** — you must look at CSP report data in whatever system you forward/store it in.

By default the app emits `Content-Security-Policy-Report-Only` (unless you turn on strict CSP), meaning CSP violations are not blocked, but the browser *may* send reports.

### Where are CSP reports stored right now?

**Currently: nowhere (no persistence).**

- The endpoint [frontend/src/app/api/csp-report/route.js](frontend/src/app/api/csp-report/route.js) always returns `204` and intentionally does **not** log payload contents (to avoid leaking URLs/user data into logs).
- If you set `CSP_REPORT_FORWARD_URL`, the endpoint will forward a redacted wrapper payload to that URL over HTTPS.

### How long are CSP reports stored?

**If you do not forward them:** retention is effectively **0** (the request is accepted and discarded).

**If you forward them:** retention is defined by the destination system (Sentry/Datadog/ELK/Webhook collector/etc.). The repo itself does not store them.

### What must be configured for reports to be sent?

1) `NEXT_PUBLIC_BASE_URL` must be set in production to an absolute URL (e.g. `https://market-predict.example.com`).
   - Without this, the app will not emit a valid `Report-To` header, so browsers don’t know where to send reports.

2) Optional: `CSP_REPORT_FORWARD_URL` to store/view reports.
   - Must be **https** and must not be localhost/private (SSRF protections will refuse those).

### How to view reports quickly

- Easiest: point `CSP_REPORT_FORWARD_URL` to an HTTPS webhook collector you control.
- Then browse that collector’s UI/logs to see incoming reports.

---

## Optional Security Upgrades Checklist

These are “nice to have / next phase” items once the current hardening is stable.

### CSP & Headers

- Enable strict CSP in production: set `CSP_STRICT=true` and confirm all required inline scripts receive the nonce (or remove inline scripts / convert to hashed scripts).
- Add monitoring/alerting for CSP report spikes (not just collection).
- Consider COEP/COOP isolation tightening only after verifying wallet flows and any third-party embeds still work.

### Abuse & Reliability

- Ensure production uses Redis rate limiting (`REDIS_URL`) so limits work across multiple instances.
- Add a WAF/bot layer (Vercel Firewall / Cloudflare / similar) to stop volumetric abuse before the app.
- Add basic DDoS/abuse dashboards (rate-limited events, top routes, spikes).

### Telemetry (low-noise, privacy-safe)

- Turn on server-side counters: `ENABLE_SECURITY_TELEMETRY=true`.
- Optional: enable Sentry breadcrumbs (requires DSN): `ENABLE_SECURITY_TELEMETRY_SENTRY=true`.

### Secrets & Supply Chain

- Enforce `npm audit --omit=dev` (or a curated allowlist) in CI as a gate.
- Enable secret scanning in GitHub + push protection.
- Consider dependency pinning policy (lockfile discipline) and periodic upgrade cadence.

### Smart Contracts (external assurance)

- Add an automated static analysis pass (e.g., Slither) in CI.
- Consider fuzz/property testing (Echidna/Foundry invariant tests) for market resolution/dispute/upgrade logic.
- Budget for an external audit if production/mainnet is planned.
