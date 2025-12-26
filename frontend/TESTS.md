Frontend tests and local instructions

Quick instructions

- Install deps (matching CI):

```bash
cd frontend
npm install --legacy-peer-deps --no-audit --no-fund
```

- Run tests once (CI):

```bash
npm run test:ci
```

- Watch tests during development:

```bash
npm run test:watch
```

Security notes

- We sanitize third-party-generated SVGs (see `src/utils/sanitizeSvg.ts`) to avoid XSS.
- CI performs a quick grep to fail on `dangerouslySetInnerHTML`/raw `innerHTML`.
- For reproducible CI, we pin dev deps in `package.json` and commit `package-lock.json`.

CI notes

- CI uses `npm install --legacy-peer-deps --no-audit --no-fund` to match local installs while upstream testing libs adapt to React 19.
- CI caches `frontend/node_modules`, `~/.npm`, and `frontend/.next` to speed runs.
