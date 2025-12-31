# MarketPredict — Architecture Outline (Wave 4)

## High-level flow

User → Next.js Web App → (Server API reads) → MarketPredict smart contract (BlockDAG testnet)

The app is designed to keep the UI responsive even when public RPC endpoints are unstable by preferring server-side reads where possible.

## Main components

1. Frontend (Next.js)
   - Pages Router UI (markets list, market detail, wallet, create-market, profile, settings)
   - App Router API routes for server-side reads (markets, market detail, balances)
   - Theme system using CSS variables (`--mp-*`) so light/dark/system themes stay readable
   - Wallet integration via Ethers v6 and injected providers (MetaMask / WalletConnect)
   - Client settings persisted locally (theme, odds display, timezone)

2. Server APIs (Next.js API routes)
   - Read-heavy endpoints use server-side RPC (server-only env var) and can emit timing headers
   - Caching patterns (including stale-while-refresh) used to reduce response spikes

3. Smart contracts (Solidity)
   - Core contract: `MarketPredict.sol`
     - Internal (in-app) balances: deposit/withdraw
     - Parimutuel YES/NO markets
     - Resolution and fee-on-profits payout logic
     - Market safety controls (pause/cancel/edit guardrails)
   - Disputes
     - Single dispute per market
     - Bond required
     - Dispute window limited to a short window after close

4. Roles & governance
   - Owner/admin controls for emergency actions
   - Permissioned market writers (to scale market creation)
   - Upgrade hygiene intended for timelock-controlled upgrades (with emergency actions separated)

## Key user flows

- Deposit: wallet → contract internal balance
- Predict: choose YES/NO + amount → `predict()` using internal balance
- Claim: after resolution → `claim()` returns winnings to internal balance
- Dispute (eligible users): open dispute with bond → market freezes pending review


