# Release draft: v1.0-wave3

Title: MarketPredict (BDAG) — Wave 3 submission
Tag: v1.0-wave3

Summary
This release packages the Wave 3 submission materials: SUBMISSION.md, DEMO_INSTRUCTIONS.md, plus the existing README and WAVE3_SUBMISSION_CHECKLIST.md.

Highlights
- Live demo: https://market-predict-bdag-cr2n.vercel.app/
- Contract (BlockDAG Testnet): 0x03B20cB83f83DA1d924D283A88694C7CBAA804f1
 - Demo video (YouTube): https://youtu.be/iuXbXecgBpE

Included files
- README.md
- WAVE3_SUBMISSION_CHECKLIST.md
- SUBMISSION.md
- DEMO_INSTRUCTIONS.md

Release notes

- Planned Steps

1. Add build & run: install, build, dev, production commands.
2. Contracts & ABI: what contracts, where ABI lives.
3. Frontend features: pages/components, UX notes.
4. Tests & CI: how to run tests and build pipeline notes.
5. Known issues/future: limitations and next steps.


Highlights / Key Features:

Create Markets: UI to create yes/no markets with question, end time, and initial liquidity.
Trade Positions: Buy yes/no shares in markets; displays live pool, implied odds, and percentages.
Market Listing: Top markets, search/list views, single-market detail pages.
Wallet Integration: MetaMask / Web3Modal connection and wallet flow.
On-chain Settlement: Solidity contract MarketPredict.sol handles market lifecycle, staking, and payouts.
Type Safety: Hardhat + TypeChain output included for safer frontend-contract interactions.
Contracts / ABI:

Main contract: MarketPredict.sol (see contracts and hardhat/artifacts/).
ABIs: generated into hardhat/abi.json, new_abi.json and abi.ts.
Deployment artifacts: hardhat/deployments/ and artifacts/ contain build and deployment metadata.

Frontend:

Framework: Next.js (app directory), TypeScript, Tailwind CSS.
Important files: page.tsx (home/top markets), frontend/src/components/* (UI components), MarketPredict.json (contract mappings).
Behavior notes: Top-3 markets shown on homepage; centering and styling use Tailwind utilities.

Build & Run (developer):

Install:
npm install
Development:
npm run dev
Build for production:
npm run build
npm start 
Hardhat (contracts):
cd contracts/hardhat
npm install
npx hardhat compile
npx hardhat run --network <network> scripts/deploy.ts

Testing:

Unit tests in test (example: Greeter.test.ts pattern).
Run: npx hardhat test from hardhat.
Frontend: run dev and manually exercise UI flows; add automated UI tests in future.

Notable Implementation Decisions:

Frontend reads ABI/addresses from local JSON configs to simplify local development.
Markets rendered with a responsive grid — badge positioning handled with absolute positioning; may need tweaks for edge-case layouts.
Certain elements required inline adjustments; may overflow on small screens. Switched certain items to flex.
Some stray parse errors were present in page.tsx (fixed: a stray </ and TSX parsing issues).
No production-ready security/audit performed on contracts.
Multiple automated tests and CI integration.

Future Improvements:

Improve responsive layout for market card centeredness.
Add end-to-end tests and CI (GitHub Actions).
Unit & integration tests for contract logic; formal audits.
Pagination, filtering, and richer market types (multi-outcome markets).
Gas optimization & upgraded contract patterns (upgradeable proxies if needed).

Changelog (this release):

Initial release: contracts compiled, ABIs exported, frontend UI scaffolding, wallet connect, market creation and trading flows implemented.
