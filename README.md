MarketPredict (BDAG)
MarketPredict is a decentralized DeFi prediction market dApp powered by BlockDAG’s ultra-fast Layer 1 network, enabling simple, low-fee event forecasting.

🚀 Live Demo
Frontend (Testnet): https://market-predict-bdag-cr2n.vercel.app/
Smart Contract (BlockDAG Testnet): 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1
Demo Video: [Coming Soon]

1. Project Overview
Problem
Most prediction markets are:

Complicated, expensive, and intimidating for new users
Prone to manipulation and centralization
Burdened by high gas fees and slow confirmations
Solution
MarketPredict delivers:

Simple, intuitive yes/no prediction markets using BDAG
Parimutuel model with 0% upfront fee, 2.9% fee on winnings only
Lightning-fast, low-cost transactions on BlockDAG Layer 1
Play Money Mode for onboarding, Real BDAG Mode for real stakes
Clean, mobile-first UI for all user levels

2. Architecture & Technical Design
Smart Contract: Solidity 0.8.20, EVM-compatible, parimutuel logic, Chainlink oracle integration, dispute system, owner/admin controls
Frontend: Next.js, Ethers.js, MetaMask/WalletConnect, responsive design
Deployment: BlockDAG Awakening Testnet (Chain ID: 1043)
Security: Input validation, owner-only functions, XSS protection, security audit checklist
Key Features:

Deposit/withdraw BDAG to/from dApp balance
Create and resolve markets (manual & oracle)
Dispute and override system for fair outcomes
Transparent fee structure (2.9% on profits only)
Real-time odds and payout calculations

3. Judging Rubric Alignment
Utility & Problem Fit (30%)
Tackles real pain points: complexity, cost, and trust in prediction markets
Enables both new and experienced users to participate with minimal friction
Play Money Mode lowers onboarding barrier
Technical Execution (30%)
Fully functional MVP: live frontend, deployed contract, wallet integration, real BDAG testnet transactions
Parimutuel math, fee-on-profits, and dispute logic implemented and tested
Robust error handling and input validation
Ecosystem Impact (20%)
Open-source, EVM-compatible contract for easy adoption by other BDAG dApps
Demonstrates DeFi utility and composability on BlockDAG
Encourages further development of prediction and staking primitives
User Experience (10%)
Clean, mobile-first UI
Simple onboarding (Play Money/Real BDAG toggle)
Clear feedback and error messages
Fast, low-fee transactions
Scalability (10%)
Designed for BlockDAG’s parallel block architecture (15,000+ TPS)
Modular contract and frontend for easy expansion (multi-category, multi-market)
Future-proofed for mainnet and additional DeFi integrations

4. What’s New in Wave 3 (MVP)
Live testnet deployment and contract verification
Full wallet integration (MetaMask, BDAG-compatible)
Deposit/withdraw, create market, and prediction flows
Parimutuel payout and fee logic
Dispute and override system
Security audit and bug fixes
[Demo video and user feedback to be added]

5. How to Use / Test
Visit the Live Frontend
Connect your BDAG-compatible wallet (MetaMask, etc.)
Switch to BlockDAG Awakening Testnet (Chain ID: 1043)
Get test BDAG from the faucet
Deposit BDAG, create or join a market, and make predictions
Withdraw winnings or test dispute/resolution flows

6. Deployment Details
Smart Contract: 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1
Deployer Wallet: 0x539bAA99044b014e453CDa36C4AD3dE5E4575367
RPC Provider: NOWNodes
Frontend: https://market-predict-bdag-cr2n.vercel.app/

7. Feedback & Iteration
[Add user/mentor feedback and how it shaped the MVP here, or note “To be updated post-judging.”]

8. Roadmap
Add multi-category and multi-market support
Leaderboards, social features, and loyalty rewards
Mainnet launch and further DeFi integrations

9. Contact
Developer: Steven Elrod
GitHub: sev123-del
Project Repo: MarketPredict-BDAG
Email: stevenelrod123@gmail.com