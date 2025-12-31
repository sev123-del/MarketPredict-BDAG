import { Chain } from 'viem';

const NEXT_PUBLIC_READ_RPC = (process.env.NEXT_PUBLIC_READ_RPC || '').trim();

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
      http: NEXT_PUBLIC_READ_RPC ? [NEXT_PUBLIC_READ_RPC] : [],
    },
    public: {
      http: NEXT_PUBLIC_READ_RPC ? [NEXT_PUBLIC_READ_RPC] : [],
    },
  },
  blockExplorers: {
    default: {
      name: 'BDAGScan (NOWNodes)',
      url: 'https://primordial.bdagscan.com', // optional
    },
  },
} as const satisfies Chain;
