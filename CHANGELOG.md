## Changelog

All notable changes for this release.

### Unreleased

- Fix: Server API BigInt serialization (avoid JSON.stringify BigInt error).
- Fix: `/api/market/[id]` await `params` and added validation for `id`.
- Fix: TypeScript null-narrowing for `rpcProvider.getBalance` in `src/pages/wallet.tsx`.
- Feature: Server-side APIs now use `BDAG_RPC` (server-only) to avoid exposing RPC to clients.
- UX: UI polish on markets and market detail pages; create-market gating for owner/allowlist.
- Add: BSL license and release helper scripts.

### Notes

- Before deploying, ensure Vercel Project Environment Variables include `BDAG_RPC` and any other server-only secrets.
- Use the provided `scripts/release_and_deploy.ps1` to commit, tag, push and deploy.
