# MarketPredict (BDAG) — Wave 3 Submission

Repository: https://github.com/your-org/MarketPredict-BDAG
Live Demo (Testnet): https://market-predict-bdag-cr2n.vercel.app/
Contract (BlockDAG Testnet): 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1

One-line summary
- MarketPredict is a decentralized, low-fee parimutuel prediction market dApp built for BlockDAG, focused on secure, transparent yes/no markets with built-in user-protection features and fast UX.

Why this meets the judging rubric
- Utility & Problem Fit (30%): Solves onboarding and cost problems for prediction markets by providing Play Money mode, low fees, and clear UX; use cases and target users listed in README.
- Technical Execution (30%): Smart contract deployed on BlockDAG Testnet; frontend live on Vercel; wallet integration (MetaMask/WalletConnect); parimutuel math and fee-on-profits implemented; security controls (self-restriction, spending limits, 48-hour resolution delay).
- Ecosystem Impact (20%): Open-source EVM-compatible contract and frontend; encourages BDAG integrations and composability.
- User Experience (10%): Mobile-first responsive UI, simplified flows, real-time odds and payout calc shown in the demo.
- Momentum (10%): Multiple deploys/tests and active improvements (timezone bug tracked), README and checklist included.

Wave 3 Deliverables (what’s included)
- Live frontend (Vercel) and verified contract address (above).
- `README.md` with overview, architecture, and demo link.
- `WAVE3_SUBMISSION_CHECKLIST.md` with testing checklist and known issues.
- Demo instructions and video shotlist (see `DEMO_INSTRUCTIONS.md` and `VIDEO_SHOTLIST.md`).
- Source code in the `frontend/` and `contracts/` folders.

What’s done vs pending
- Done:
  - Frontend deployed and wallet flows implemented.
  - Contract deployed and verified on testnet.
  - Security features implemented (self-restrict, spending limits, pause, refund flows).
  - Removed committed secrets and sanitized repo history.
- Pending / recommended before final grading:
  - Finalize and attach demo video (record per `VIDEO_SHOTLIST.md`).
  - Final run of full user flow recording (deposit → create market → predict → resolve → claim).
  - Final sanity tests for timezone conversion across zones (quick verification checklist included in `WAVE3_SUBMISSION_CHECKLIST.md`).

Quick submission copy (paste into Wave 3 form)
- Project name: MarketPredict (BDAG)
- GitHub repo: https://github.com/your-org/MarketPredict-BDAG
- Live demo: https://market-predict-bdag-cr2n.vercel.app/
- Contract address: 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1
- Short description (one line): Low-fee, secure prediction markets on BlockDAG with built-in user protection and parimutuel payouts.
- Technologies: Solidity, Hardhat, Next.js, Ethers.js, Tailwind CSS, NOWNodes.

Maintainers / Contact
- Steven Elrod — stevenelrod123@gmail.com

Notes
- Timezone conversion bug is tracked in `WAVE3_SUBMISSION_CHECKLIST.md` and is marked as "mostly fixed"; please run the quick timezone verification in `WAVE3_SUBMISSION_CHECKLIST.md` before final submission.

---

Files to attach to the submission form
- `README.md`, `WAVE3_SUBMISSION_CHECKLIST.md`, `SUBMISSION.md`, `DEMO_INSTRUCTIONS.md`, `VIDEO_SHOTLIST.md` (this file), and the repo URL.

