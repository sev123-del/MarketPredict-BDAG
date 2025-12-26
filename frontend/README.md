This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Frontend — Project specifics

This folder contains the Next.js frontend for MarketPredict-BDAG. It includes both App Router and Pages Router code paths and a small set of API routes used as secure read proxies for on-chain data.

### Quick local setup

1. Install dependencies and run dev server:

```powershell
cd frontend
npm install
npm run dev
```

2. Environment notes (DO NOT commit secrets):
- `BDAG_RPC` — server-only RPC used by API routes (keep private)
- `NEXT_PUBLIC_READ_RPC` — optional public read-only RPC (client-side safe)

3. If running rate-limiter tests, start a local Redis instance and set `REDIS_URL`:

```powershell
# example: run Redis on localhost:6380 (adjust as needed)
$Env:REDIS_URL="redis://localhost:6380"
npm run test:ci
```

### Testing

- Tests are written with Vitest. Run `npm run test` for interactive mode or `npm run test:ci` for one-shot CI-style runs.
- Deterministic specs exercise the Redis-backed rate limiter and a mocked Redis client. CI workflows provide a Redis service for these specs.

### Security & privacy highlights (frontend)

- Centralized wallet state via `frontend/src/context/WalletContext.tsx` to avoid scattered provider queries and reduce double-connect UI.
- Redis-first rate limiting with in-memory fallback: `frontend/src/lib/rateLimit.js`.
- Baseline security headers via `frontend/middleware.ts`; optional strict CSP controlled by `CSP_STRICT`.
- Log redaction helper: `frontend/src/lib/redact.ts` to avoid leaking credentials.
- GDPR & privacy guidance: `frontend/PRIVACY.md`.

### Key files

- `src/context/WalletContext.tsx` — centralized injected-provider state and connect/disconnect helpers
- `src/components/Header.tsx` — header now consumes `useWallet()`
- `src/pages/wallet.tsx`, `src/pages/create-market.tsx` — refactored to use `useWallet()`
- `src/lib/rateLimit.js`, `src/lib/redisClient.js` — rate limiting + Redis client
- `middleware.ts` — security headers and optional CSP handling

If you want this README mirrored into the project root or into `DEMO_INSTRUCTIONS.md`, tell me and I will sync it.
