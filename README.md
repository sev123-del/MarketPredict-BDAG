# MarketPredict-BDAG

MarketPredict is a decentralized DeFi prediction market dApp powered by BlockDAG's ultra-fast Layer 1 network, enabling simple, low-fee event forecasting.

## Node.js

For consistent local builds and to avoid known Hardhat 2.x instability on **Node 24+ on Windows**, use **Node 20 LTS** (recommended) or **Node 22 LTS**.

This repo includes a root `.nvmrc` (and `contracts/hardhat/.nvmrc`) set to Node 20.

### Switching Node versions

- **Windows (nvm-windows):**

```powershell
nvm install 20
nvm use 20
node -v
```

- **macOS/Linux (nvm):**

```bash
nvm install
nvm use
node -v
```

## Running tests

Run from the repo root:

```powershell
cd C:\Users\rodsk\MarketPredict-BDAG
npm run test:contracts
npm run test:frontend
# or run both:
npm test
```

Or run directly inside each folder:

```powershell
cd C:\Users\rodsk\MarketPredict-BDAG\contracts\hardhat
npm test

cd C:\Users\rodsk\MarketPredict-BDAG\frontend
npm run test:ci
```

## Development

1. Project Overview
Problem
Most prediction markets are:

Complicated, confusing, expensive, and intimidating for new users
Prone to centralization
Burdened by high gas fees and slow confirmations

Solution
MarketPredict delivers:

Simple, intuitive yes/no prediction markets using BDAG
Parimutuel model with 0% upfront fee, 2.9% fee on winnings only
Lightning-fast, low-cost transactions on BlockDAG Layer 1
Clean, mobile-first UI for all users

2. Architecture & Technical Design
Smart Contract: Solidity 0.8.20, EVM-compatible, parimutuel logic, Chainlink oracle integration, dispute system, owner/admin controls
Frontend: Next.js, Ethers.js, MetaMask/WalletConnect, responsive design
Deployment: BlockDAG Awakening Testnet (Chain ID: 1043)
Security: Input validation, owner-only functions, XSS protection, security audit checklist

Key Features:

Deposit/withdraw BDAG to/from dApp balance
Oracle resolved markets
Dispute and override system for fair outcomes
Transparent fee structure (2.9% on profits only)
Real-time odds and payout calculations

3. Judging Rubric Alignment
- Utility & problem fit: low-friction, yes/no prediction markets with a practical dispute mechanism.
- Technical execution: upgradeable contracts, bounded RPC retries, server-side caching, and automated tests in both contracts and frontend.
- Ecosystem impact: AI market-writer workflow designed for scaling content on BlockDAG.
- User experience: clear market status indicators (open/resolved/cancelled/expired, and paused/disputed when applicable).
- Momentum: steady commits across contract, frontend, and deployment tooling.

## Phase 2 Wave 4 (polished MVP)

Wave 4 is focused on security, stability, clarity in the UX, and governance best practices.

Key updates in this wave
- Market safety controls: per market pause/edit for creators (with guardrails), plus an emergency global pause role.
- Disputes: single dispute per market with a bond; opening a dispute freezes the market; disputes are only allowed after close and up to 2 hours after close.
- Scalable market creation: permissioned market writers plus a draft queue so a bot can suggest markets and a human can approve and publish quickly.
- Upgrade hygiene: transparent proxy pattern with a ProxyAdmin that can be transferred to a TimelockController for delayed upgrades; immediate emergency actions remain under the multisig.
- RPC resilience: markets/market pages prefer server-side API reads (private RPC) so the UI degrades more gracefully during public RPC instability.
- Wallet UX + theming: moved cache-clearing controls to Wallet; made wallet panels and key numbers theme-safe (no black boxes in light/system themes).
- Market detail UX: streamlined the amount presets (1 / 10 / 100 / 1K / 10K + Max), moved close-time display below the submit button, and removed the "Market Live" badge to save space.
- Added System/Light/Dark Theme functionality in Settings
- Settings clarity: repurposed network settings to auto display current network and added a global timezone preference (used for close-time formatting).
- Categories consistency: centralized market categories and updated Create Market category selection to chips using the same ordering as the Markets page.
- Performance & resilience: added server timing headers on key endpoints and improved top-markets caching (stale-while-refresh) to reduce slow spikes.
- Admin controls: added creator/owner edit + owner cancel/delete actions with confirmation in Market Detail.
- CSP + security headers baseline (HSTS in prod, X-Frame-Options, nosniff, referrer policy, permissions policy, COOP, Origin-Agent-Cluster) with an optional strict per-request CSP mode (CSP_STRICT=true) using nonces.
- CSP reporting endpoint (/api/csp-report) with same-origin enforcement, rate limiting, payload size limits, no-store caching, and SSRF-safe forwarding rules (https-only + block localhost/private targets).
- Redis-first rate limiting (with in-memory fallback) to mitigate abuse/spikes on key API routes (includes proxy-aware IP extraction and safe key sanitization).
- Same-origin guard for browser-initiated write requests (blocks cross-site POST/PUT/PATCH/DELETE unless same-origin or explicitly allowlisted).
- SVG/XSS hardening for avatars: sanitize third-party/generated SVGs (DOMPurify + forbid scripts/foreignObject + strip external href/xlink:href, url(...), and @import) before rendering.
- CI/PR security gates: automated scans that fail builds/PRs if dangerouslySetInnerHTML, raw .innerHTML, or external SVG resource references are introduced.
- Secret-leak prevention: build-time check to ensure private RPC credentials are not exposed via client NEXT_PUBLIC_* variables (specifically blocks NEXT_PUBLIC_BDAG_RPC).
- Logging hygiene: redaction helpers to avoid leaking RPC credentials/tokens in logs and error responses; privacy-first guidance to avoid logging sensitive identifiers.

4. How to Use / Test
Visit the Live Frontend
Connect your BDAG-compatible wallet (MetaMask, etc.)
Switch to BlockDAG Awakening Testnet (Chain ID: 1043)
Get test BDAG from the faucet
Deposit BDAG, join a market, pick yes/no, input amount, and make predictions
Withdraw winnings

5. Deployment Details
Smart Contract: 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1
Deployer Wallet: 0x539bAA99044b014e453CDa36C4AD3dE5E4575367
RPC Provider: NOWNodes
Frontend: https://market-predict-bdag-cr2n.vercel.app/

6. Roadmap
Add more airtight security upgrades
Continue mobile first strategy
Add Dispute & resolution protocols
Leaderboards, social features, chat, and loyalty rewards
Integrate on-chain swap to/from USDC for value consistency
Professional external audits
Mainnet launch and further DeFi integrations

7. Contact
Developer: Steven Elrod
GitHub: sev123-del
Project Repo: MarketPredict-BDAG
Email: stevenelrod123 with google

---

**Quick local setup (summary)**


**Testing & CI (notes)**

- Tests use Vitest. Some integration/deterministic specs exercise the Redis-backed rate limiter and a mocked Redis client.
- CI workflows in `frontend/.github/workflows` include Redis as a service for the rate-limiter tests and run the deterministic test suite.

**Security highlights**

- Centralized rate-limiting with Redis-first fallback and in-memory fallback to mitigate abusive traffic (`frontend/src/lib/rateLimit.js`).
- Baseline security headers applied via `frontend/middleware.ts` with an optional stricter CSP mode controlled by `CSP_STRICT`.
- Logging hygiene and redaction helpers in `frontend/src/lib/redact.ts` to avoid leaking sensitive RPC credentials in logs.
- Privacy guidance and GDPR notes documented in `frontend/PRIVACY.md`.

Future security upgrades checklist + CSP report storage notes: see [FUTURE_SECURITY_UPGRADES.md](FUTURE_SECURITY_UPGRADES.md).

**Key locations (recent work)**

- Wallet state consolidation: `frontend/src/context/WalletContext.tsx`
- Header & pages using the centralized wallet: `frontend/src/components/Header.tsx`, `frontend/src/pages/wallet.tsx`, `frontend/src/pages/create-market.tsx`
- Rate limiter + Redis client: `frontend/src/lib/rateLimit.js`, `frontend/src/lib/redisClient.js`
- Middleware & CSP handling: `frontend/middleware.ts`, `frontend/src/app/api/csp-report/route.js`
- Log redaction: `frontend/src/lib/redact.ts`

