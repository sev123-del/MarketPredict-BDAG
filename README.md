# MarketPredict (BDAG)

MarketPredict is a decentralized prediction market built on BlockDAG’s Layer 1 for ultra-fast, low-fee event forecasting.

## 1. Project Idea Brief

### Problem
Most prediction markets today are:
- Complicated to use
- Susceptible to Manipulation
- Centralized or controlled by a single company
- Expensive (high gas/fees)
- Intimidating
- Impersonal

### Solution
**MarketPredict** is a simple, BDAG-based prediction platform where people can:
- Use BDAG to make predictions on clear yes/no questions
- Tier-based system to reduce ability for users to manipulate markets
- Enjoy very low fees and lightning fast confirmations (BlockDAG Layer 1)
- Start in our free/anonymous **Play Money Mode** to learn, then switch to **Real BDAG Mode** to make the big bucks.
- Use a clean, “even a 1st grader could use it” interface

### Target Market
- Crypto users who want a trustworthy, fun, decentralized, low cost, and social on-chain prediction platform
- Fans of sports, crypto, world events, and more
- People who like multiple-market-prediction apps but want:
  - Lower fees
  - Simpler UI
  - Stress free UX
  - Decentralization
  - Social connection & friendly competition
  - A fresh futuristic layer 1 ecosystem (BlockDAG)

---

## 2. Architecture Overview

Very high level flow:

1. User opens **MarketPredict**
2. User selects **Play Money Mode** or **Real BDAG Mode**
3. Example, if Real BDAG:
   - User connects BDAG-compatible wallet if never/not connected
   - User deposits BDAG into a smart-contract-based balance
4. User selects a **Tier** (Bronze, Silver, Gold, etc.)
5. User chooses a **Market Category and/or Question**
   - Example: “Will COINZ reach $0.10 before April?”
6. User selects **YES** or **NO** and enters a BDAG amount to risk
7. Market resolves based on an oracle / admin verification
8. Winnings are added to the user’s in-dApp BDAG balance
9. User can **withdraw BDAG** back to their wallet at any time

There is a simple internal BDAG balance ledger that tracks:
- Deposits
- Predictions
- Payouts
- Withdrawals

We will later add:
- My Results page
- Admin / oracle tools
- Leaderboards and user stats
- Social / chat capability
- Loyalty rewards
- Referral program
- Contests and tournaments
- 1 vs 1

---

## 3. Tier Levels (Real BDAG Mode)

The Real BDAG Mode lets users choose a tier based on the minimum amount of BDAG they want to risk.  
Higher tiers require higher minimum risk.

| Tier | Minimum BDAG Risk | Description |
|------|-------------------|--------------|
| 🥉 Bronze | **1 BDAG** | Entry level |
| 🪙 Silver | **10 BDAG** | Beginner |
| 🏆 Gold | **100 BDAG** | Experienced |
| 🛡️ Platinum | **1,000 BDAG** | Power user |
| 💎 Diamond | **10,000 BDAG** | Elite predictor |
| 👑 GrandMaster | **100,000 BDAG** | VIP |
| 🔥 Legendary | **1,000,000 BDAG** | Ultimate Tier |

---

## 4. Tech Stack

**Smart Contracts**
- Solidity (v0.8.x)
- EVM-compatible (BlockDAG network)
- Scaffold contract: `contracts/MarketPredict.sol`
- Foundry / Hardhat for future testing & deployment

**Frontend**
- React (or Next.js) for web interface
- MetaMask & WalletConnect integration
- Mobile-first responsive layout

**Design / Architecture**
- Mockups in `/frontend/mockups/`
- Architecture diagram in `/architecture/`
- Planned deployment to BlockDAG Testnet

**Other**
- GitHub for version control
- Optional: IPFS for decentralized frontend hosting

---

## 5. Current Status (Wave 1 + Wave 2)

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

##  Wave 2 Submission (Nov 25, 2025 Buildathon)

**Focus:** Ideation & Scaffolds — Functional Architecture Milestone

###  Deliverables Checklist
- [x] **GitHub Repo Setup:** [MarketPredict Repo Link](https://github.com/sev123-del/MarketPredict-BDAG)
- [x] **Concept Brief:** Included above (Problem, Solution, Market)
- [x] **Architecture Outline:** [`/architecture/architecture.md`](architecture/architecture.md)
- [x] **Smart Contract Scaffold:** [`/contracts/MarketPredict.sol`](contracts/MarketPredict.sol)
- [x] **UI Wireframes / Mockups:** [`/frontend/mockups/overview.md`](frontend/mockups/overview.md)
- [x] **Tech Stack:** See Section 4 above in README
- [x] **Pitch Video:** [Watch on Google Drive](https://drive.google.com/file/d/1ed7DaDhp8wnpLPG5f42ZGGyubLKJeylU/view?usp=sharing)

###  Summary
MarketPredict is a decentralized prediction dApp on the BlockDAG Layer 1 network.  
It enables users to create and participate in simple yes/no prediction markets using BDAG tokens or Play Money.  
The project emphasizes:
- **Trustworthiness** and **intuitive UX**
- **Security-first** contract design
- **Tier-based system**
- **Scalable architecture ready for BDAG mainnet launch**

###  Current Status
- Architecture diagram complete  
- UI mockups ready 
- Smart contract scaffold in place   
- Preparing for Wave 3 (MVP prototype & testnet deployment)

---

## 6. Contact

- Builder: Steven Elrod
- Email: stevenelrod123@gmail.com
- Project: MarketPredict (BDAG market prediction dApp)
