# Sample Hardhat Project

## Node.js

Hardhat 2.x is not stable on Node.js 24+ on Windows (it can crash on exit with a libuv assertion). Use Node.js 20 LTS or 22 LTS for this folder.

This folder includes a `.nvmrc` set to Node 20 for convenience.

### Switching Node versions (recommended)

- **Windows (nvm-windows):**

```powershell
nvm install 20
nvm use 20
node -v
```

- **macOS/Linux (nvm):**

```bash
cd contracts/hardhat
nvm install
nvm use
node -v
```

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```
