# MarketPredict-BDAG

MarketPredict is a decentralized DeFi prediction market dApp powered by BlockDAG’s ultra-fast Layer 1 network, enabling simple, low-fee event forecasting.
## Development

For local development and to enable reliable on-chain reads, provide the following environment variables (do NOT commit secrets):
- `BDAG_RPC` - Server-only RPC URL used by API routes (private). Required for server reads in production.
- `DEV_FALLBACK_RPC` - Optional local fallback RPC for development only.
- `NEXT_PUBLIC_READ_RPC` - Public read-only RPC for client-side reads (non-secret). Prefer leaving this empty and using server APIs for reads.

Important deployment guidance:
- `BDAG_RPC` is REQUIRED for production and must be kept private (server-side only). If `BDAG_RPC` is missing in production, API routes will return an explicit error (502) instead of silently falling back to a dev node.
- `DEV_FALLBACK_RPC` is intended ONLY for local development. Do NOT set `DEV_FALLBACK_RPC` in production environments or in any `NEXT_PUBLIC_` variable.
- `NEXT_PUBLIC_READ_RPC` may be used for client-side read-only calls but it's recommended to perform reads via server APIs so secrets never reach the client.

Create a `.env.local` at the project root with values for local testing, for example:

```
BDAG_RPC=https://your-private-rpc.example
DEV_FALLBACK_RPC=https://your-dev-fallback-rpc.example
NEXT_PUBLIC_READ_RPC=https://your-public-read-rpc.example
```

Security note: keep `BDAG_RPC` and any RPC keys out of client-exposed `NEXT_PUBLIC_*` variables and store them in your deployment's secret manager.
MarketPredict (BDAG)
MarketPredict is a decentralized DeFi prediction market dApp powered by BlockDAG’s ultra-fast Layer 1 network, enabling simple, low-fee event forecasting.

🚀 Live Demo
Frontend (Testnet): https://market-predict-bdag-cr2n.vercel.app/
Smart Contract (BlockDAG Testnet): 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1
Demo Video: https://youtu.be/iuXbXecgBpE

1. Project Overview
Problem
Most prediction markets are:

Complicated, expensive, and intimidating for new users
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
Create and resolve markets (manual & oracle)
Dispute and override system for fair outcomes
Transparent fee structure (2.9% on profits only)
Real-time odds and payout calculations

3. Judging Rubric Alignment
Utility & Problem Fit (30%)
Tackles real pain points: complexity, cost, centralization, and trust in prediction markets
Enables both new and experienced users to participate with minimal friction
Technical Execution (30%)
Fully functional MVP: live frontend, deployed contract, wallet integration, real BDAG testnet transactions
Parimutuel math, fee-on-profits, and dispute logic implemented and tested
Robust error handling and input validation
Ecosystem Impact (20%)
EVM-compatible contract
Demonstrates DeFi utility and composability on BlockDAG
Encourages widespread adoption of BDAG network
User Experience (10%)
Clean, mobile-first UI
Simple onboarding
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
Deposit BDAG, join a market, pick yes/no, input amount, and make predictions
Withdraw winnings

6. Deployment Details
Smart Contract: 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1
Deployer Wallet: 0x539bAA99044b014e453CDa36C4AD3dE5E4575367
RPC Provider: NOWNodes
Frontend: https://market-predict-bdag-cr2n.vercel.app/

7. Feedback & Iteration
[To be updated post-judging. Ran out of time.]

8. Roadmap
Add settings page (Restrictions, self-limits, avatars, usernames, etc.)
Easier navigation with page links globally
Add dispute process for users
Leaderboards, social features, chat, and loyalty rewards
Mainnet launch and further DeFi integrations
Integrate on-chain swap to/from USDC 
Responsiveness with layouts, ease of use

9. Contact
Developer: Steven Elrod
GitHub: sev123-del
Project Repo: MarketPredict-BDAG
Email: stevenelrod123@gmail.com