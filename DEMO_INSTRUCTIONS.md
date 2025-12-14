# Demo Instructions — MarketPredict (BDAG)

Goal: Provide a short, reproducible walkthrough testers/judges can run against the live demo or locally.

Prerequisites
- BDAG-compatible wallet (MetaMask recommended)
- Testnet BDAG (faucet) for Chain ID 1043
- Ensure `NEXT_PUBLIC_BDAG_RPC` is set for local runs (see `.env.local`)

Quick local run
```bash
cd frontend
npm install
# copy example env, then edit .env.local to include NEXT_PUBLIC_BDAG_RPC
cp .env.local.example .env.local
# edit .env.local -> set NEXT_PUBLIC_BDAG_RPC=https://bdag.nownodes.io/YOUR_KEY
npm run dev
```

Walkthrough steps (quick, 90–120s demo)
1. Open the live demo: https://market-predict-bdag-cr2n.vercel.app/ (or `http://localhost:3000`)
2. Connect wallet and switch to BlockDAG Awakening Testnet (Chain ID: 1043).
3. Show deposit flow: deposit test BDAG into the dApp balance.
4. Create a market (title, close time, initial liquidity) — show real-time odds preview.
5. Place a YES prediction and a NO prediction from two wallets (or show Play Money mode).
6. Show live pool/odds updating.
7. Resolve a market (demo uses admin/resolution UI or test helper) and show claim flow.
8. Show security features: set a spending limit, enable self-restriction, and demonstrate blocked prediction attempt.
9. Show contract verification on BlockDAG (explorer link) and reference the contract address.
10. End with a short summary of features and a call to the repo (link).

What to record for judges
- Full screen browser tab showing the actions above
- Short overlay narration explaining what’s happening and why it matters (see `VIDEO_SHOTLIST.md`)
- Optional: a few commands showing `git tag` and the contract address

Common troubleshooting
- If wallet cannot connect, verify RPC is responsive and `NEXT_PUBLIC_BDAG_RPC` is set in Vercel.
- If real-time updates lag, refresh the page or re-connect the wallet.

