# Market Predict (BDAG)

A decentralized prediction dApp built on the BlockDAG (BDAG) Layer 1 network.

## 1. Project Idea Brief

### Problem
Most prediction markets today are:
- Complicated to use
- Centralized or controlled by a single company
- Expensive (high gas/fees)
- Hard to access from many countries and regions

### Solution
**Market Predict** is a simple, BDAG-based prediction platform where people can:
- Use BDAG to make predictions on clear yes/no questions
- Enjoy very low fees and fast confirmations (BlockDAG Layer 1)
- Start in **Play Money Mode** to learn, then switch to **Real BDAG Mode**
- Use a clean, “even a 1st grader can use it” interface

### Target Market
- Crypto users who want a fair, on-chain prediction platform
- Fans of sports, crypto prices, world events, and more
- People who like Polymarket-style apps but want:
  - Lower fees
  - Simpler UI
  - A fresh ecosystem on BlockDAG

---

## 2. Architecture Overview

Very high level flow:

1. User opens **Market Predict**
2. User selects **Play Money Mode** or **Real BDAG Mode**
3. If Real BDAG:
   - User connects BDAG-compatible wallet
   - User deposits BDAG into a smart-contract-based balance
4. User selects a **Tier** (Bronze, Silver, Gold, etc.)
5. User chooses a **Market Question**
   - Example: “Will BDAG reach $0.10 before April?”
6. User selects **YES** or **NO** and enters a BDAG amount
7. Market resolves based on an oracle / admin verification
8. Winnings are added to the user’s in-dApp BDAG balance
9. User can **withdraw BDAG** back to their wallet

There is a simple internal BDAG balance ledger that tracks:
- Deposits
- Predictions
- Payouts
- Withdrawals

We will later add:
- My Predictions page
- Admin / oracle tools
- Leaderboards and user stats

---

## 3. Tech Stack

**Smart Contracts:**
- Solidity (0.8.x)
- BlockDAG-compatible EVM
- Basic Foundry / Hardhat project structure later

**Frontend:**
- React (or Next.js) for web UI
- MetaMask / WalletConnect for wallet connection
- Simple, mobile-friendly layout

**Other:**
- GitHub for version control
- (Later) IPFS / static hosting for frontend

---

## 4. Current Status (Wave 1 + Wave 2)

- [x] Project idea brief (problem, solution, market)
- [x] GitHub repo initialized
- [x] Architecture outline written here in README
- [x] Smart contract scaffold file added (see `/contracts/MarketPredictScaffold.sol`)
- [x] Early UI wireframes (see `/frontend/mockups/`)

Next:
- Implement real BDAG deposit / withdraw logic
- Connect frontend to contract on BlockDAG testnet
- Record a short demo video for Wave 3

---

## 5. Contact / Team

- Builder: <YOUR NAME HERE>
- Project: Market Predict (BDAG prediction dApp)
