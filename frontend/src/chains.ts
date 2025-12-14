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
      http: [process.env.NEXT_PUBLIC_BDAG_RPC || ''],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_BDAG_RPC || ''],
    },
  },
  blockExplorers: {
    default: {
      name: 'BDAGScan (NOWNodes)',
      url: 'https://primordial.bdagscan.com', // optional
    },
  },
} as const satisfies Chain;
