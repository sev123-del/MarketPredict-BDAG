import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    bdagTestnet: {
      url: process.env.RPC_URL || "https://bdag-testnet.nownodes.io/a9d7af97-bb9a-4e41-8ff7-93444c49f776",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: "PLACEHOLDER", // optional, not used yet
  },
};

export default config;