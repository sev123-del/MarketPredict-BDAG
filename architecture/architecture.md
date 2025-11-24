# Market Predict – Architecture Outline

**High-Level Flow**

User (Wallet or Guest) → Web App (React) → Smart Contracts on BlockDAG

## Main Components

1. **Frontend (Web App)**
   - Mode selection: Play Money vs Real BDAG
   - Tier selection: Bronze, Silver, Gold, etc.
   - Market overview: Popular, Biggest Pool, Most Lopsided
   - Market details: YES/NO, amount input
   - Results screens: Win / Loss

2. **Smart Contract Layer**
   - `MarketPredict.sol`
   - Tracks:
     - User internal BDAG balances
     - Market questions
     - YES pool / NO pool per market
     - Resolved outcome
   - Handles:
     - Deposits
     - Predictions (YES/NO)
     - Payout logic
     - Withdrawals

3. **Oracle / Admin**
   - Verifies real-world outcome (e.g. price, sports result)
   - Calls `resolveMarket(marketId, outcome)` on-chain

4. **Wallet Integration**
   - Users connect BDAG-compatible wallet
   - dApp reads balances & allows BDAG deposit into contract


