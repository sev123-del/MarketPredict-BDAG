# Phase 4 — MVP Test Report (Dec 31, 2025)

This report summarizes stability checks performed for the MarketPredict MVP and highlights user-facing behavior during degraded network conditions (testnet RPC issues).

## Scope

- Core flows
  - Browse markets
  - Market detail view
  - Predict YES/NO (placing positions)
  - Dispute (single dispute per market + bond) and frozen-market UX
  - Creator/admin tools (pause/edit; global pause)
  - Permissioned market writers + draft queue approval flow
- Degraded mode
  - Testnet RPC instability (observed downtime)

## Automated Tests

- Smart contracts (Hardhat)
  - Status: PASS
  - Includes:
    - Disputes: one dispute per market; bond escrow; market freezes; resolve dispute paths
    - Dispute timing: dispute allowed only within 2 hours after close
    - Writers: owner can add/remove; writers can create markets
    - Upgrades: timelock-upgrade path (ProxyAdmin owned by timelock); direct upgrades blocked

- Frontend (Vitest)
  - Status: Run locally/CI before submission
  - Notes: Focus on regressions in pages and API routes.

## Late Wave-4 UX checks (end of week)

- Market Detail: compact header (removed live badge), close time moved below submit, quick-amount presets reduced + Max.
- Settings: global timezone preference used for close-time formatting.
- Wallet: theme-safe number colors and improved Max button legibility.

## Manual QA Checklist

### Markets List

- Shows market pools and close time.
- Shows status badges for Resolved / Cancelled / Expired.
- Shows **Disputed (Frozen)** when the market is disputed.
- Shows **Paused** for creator/admin-paused markets.
- If server RPC is down, the UI shows a clear message and continues retrying via auto-refresh.

### Market Detail

- Predict works for open markets.
- Claim works for resolved markets.
- Dispute button:
  - Only appears for users with a position.
  - Only appears after market close and **within 2 hours** after close.
  - After a dispute is opened, the market is frozen and additional disputes are blocked.

### Admin / Creator Tools

- Creator can pause/unpause their market.
- Creator can edit metadata only before any bets.
- Owner/admin can resolve disputes and optionally cancel a market.

## Known Constraints / Notes

- Testnet RPC downtime can prevent live on-chain reads from wallets.
  - The UI prioritizes server API reads where possible.
  - Auto-refresh retries keep the page responsive during outages.

## Submission Notes (Buildathon Judging Criteria)

- Utility & Problem Fit: end-to-end prediction markets with disputes + admin safety controls.
- Technical Execution: upgrade-safe contract, timelocked upgrades, and role separation.
- Ecosystem Impact: permissioned writers + draft queue enables scalable market listing.
- UX: clear status badges and frozen-market messaging.
- Momentum: steady commits across contract + frontend + CI fixes.
