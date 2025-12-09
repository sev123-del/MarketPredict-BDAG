import { Chain } from 'viem';

export const blockdagTestnet = {
  id: 1043,
  name: 'BlockDAG Testnet (NOWNodes)',
  nativeCurrency: {
    decimals: 18,
    name: 'BlockDAG',
    symbol: 'BDAG',
  },
  rpcUrls: {
    default: {
      http: ['https://bdag.nownodes.io/a9d7af97-bb9a-4e41-8ff7-93444c49f776'],
    },
    public: {
      http: ['https://bdag.nownodes.io/a9d7af97-bb9a-4e41-8ff7-93444c49f776'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BDAGScan (NOWNodes)',
      url: 'https://primordial.bdagscan.com', // optional
    },
  },
} as const satisfies Chain;
