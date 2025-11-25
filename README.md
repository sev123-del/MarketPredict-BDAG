# MarketPredict (BDAG)

MarketPredict is a decentralized DeFi prediction market dApp powered by BlockDAG’s ultra-fast Layer 1 network, enabling simple, low-fee event forecasting.


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
- MarketPredict leverages BlockDAG’s parallel confirmation architecture to eliminate slow confirmations and network congestion. This enables real-time event forecasting without sacrificing decentralization or security.

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

Scalability:
MarketPredict is designed to scale linearly with BlockDAG’s DAG-based block structure, supporting up to 15,000 transactions per second while maintaining low latency and near-zero network fees. Its modular architecture enables easy expansion into multi-category prediction markets (sports, crypto, events, and more) without compromising performance.

---

## 3. Buildathon Lane

**Chosen Track:** 🏁 DeFi Speedway  
**Rationale:** MarketPredict is a DeFi-powered prediction platform that leverages BDAG smart contracts for staking, settlements, and reward distribution. It demonstrates how financial interactions (risk tiers, deposits, payouts) can operate seamlessly on BlockDAG’s high-speed Layer 1 with strong UX and low fees — fully aligned with the DeFi Speedway lane’s objectives of 
advanced, user-focused financial protocols.

---

## 4. Tech Stack

**Smart Contracts**
- Solidity (v0.8.x)
- EVM-compatible (BlockDAG network)
- Smart contract: `contracts/MarketPredict.sol`
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

## 5. Current Status 

**Wave 1 + Wave 2 Progress**
- [x] Project idea brief (problem, solution, market)
- [x] GitHub repo initialized
- [x] Architecture outline written here in README
- [x] Smart contract scaffold file added (see `/contracts/MarketPredictScaffold.sol`)
- [x] Early UI wireframes (see `/frontend/mockups/`)

Next:
- Implement real BDAG deposit / withdraw logic
- Connect frontend to contract on BlockDAG testnet
- Record a short demo video for Wave 3

##  Wave 2 Submission (Nov 25, 2025 Buildathon)
**Focus:** Ideation & Scaffolds — Functional Architecture Milestone

###  Deliverables Checklist
- [x] **GitHub Repo Setup:** [MarketPredict Repo Link](https://github.com/sev123-del/MarketPredict-BDAG)
- [x] **Concept Brief:** Included above (Problem, Solution, Market)
- [x] **Architecture Outline:** [`/architecture/architecture.md`](architecture/architecture.md)
- [x] **Smart Contract File:** [`/contracts/MarketPredict.sol`](contracts/MarketPredict.sol)
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

### Ecosystem Impact
MarketPredict demonstrates how DeFi logic and gamified prediction can coexist in the BlockDAG ecosystem.  
By incentivizing user participation with BDAG tokens and providing open-source contract templates, it expands BlockDAG’s real-world utility and encourages other developers to integrate BDAG-native staking, payout, and prediction mechanisms into their own apps.

###  Current Status
- Architecture diagram complete  
- UI mockups ready 
- Smart contract in place

---

## 6. Next Milestone (Wave 3 - MVP)
**Next Submission Target:** Wave 3 (Dec 13, 2025) — MVP prototype & testnet deployment.

Focus: Smart contract interaction via frontend
- Preparing for Wave 3 (MVP prototype & testnet deployment)
- [ ] Integrate BDAG wallet connection
- [ ] Display current user tier and BDAG balance
- [ ] Enable yes/no prediction submission (mock only)
- [ ] Add results display (local mock data)
- [ ] Deploy live testnet frontend by Dec 13

---

## 7. Deployment
The MarketPredict smart contract has been successfully deployed to the **BlockDAG Testnet**.
Deployment verified via NOWNodes RPC connection on BlockDAG testnet.

- **Deployed Address:** `0x96547F3e461E73578b744dA420EAb61A6D8F9fB1`
- **Deployer Wallet:** `0x539bAA99044b014e453CDa36C4AD3dE5E4575367`
- **RPC Provider:** [NOWNodes](https://nownodes.io)
- **Verified using Hardhat Console:** `await contract.owner()` returned deployer address.

### Implementation Highlights
- Deployed to BlockDAG testnet using Hardhat with NOWNodes RPC integration.
- Smart contract verified using Hardhat Console — `await contract.owner()` returned correct deployer address.
- RPC and API key security managed through `.env` configuration.
- Parallel deployment tested for compatibility with BlockDAG EVM.

---

## 8. Contact

- Developer: Steven Elrod
- Project: MarketPredict (BDAG market prediction dApp)
- GitHub: [sev123-del](https://github.com/sev123-del)  
- Project Repo: [MarketPredict-BDAG](https://github.com/sev123-del/MarketPredict-BDAG)
- Email: stevenelrod123@gmail.com
