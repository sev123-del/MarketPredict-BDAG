## Changelog

All notable changes for this release.

### Unreleased

- Fix: Server API BigInt serialization (avoid JSON.stringify BigInt error).
- Fix: `/api/market/[id]` await `params` and added validation for `id`.
- Fix: TypeScript null-narrowing for `rpcProvider.getBalance` in `src/pages/wallet.tsx`.
- Feature: Server-side APIs now use `BDAG_RPC` (server-only) to avoid exposing RPC to clients.
- UX: UI polish on markets and market detail pages; create-market gating for owner/allowlist.
- Add: BSL license and release helper scripts.

- UX: Wallet page cleanup (theme-safe panels, clear cache moved to Wallet, improved deposit/withdraw max actions).
- UX: Market detail cleanup (removed live badge, moved close-time display below submit, streamlined amount presets + added Max).
- UX: Reduced top padding across key pages to bring content closer to the header.
- UX: Category consistency (shared ordered category list; create-market category selector switched to chips).
- Theme: Replaced hard-coded dark surfaces with theme variables to avoid “black boxes” in light/system themes.
- Performance: Added server-side timing headers for `/api/markets` and `/api/top-markets` and improved `/api/top-markets` caching (stale-while-refresh).
- Settings: Added a global timezone preference and removed per-market timezone UI to save space.

### Notes

- Before deploying, ensure Vercel Project Environment Variables include `BDAG_RPC` and any other server-only secrets.
- Use the provided `scripts/release_and_deploy.ps1` to commit, tag, push and deploy.
