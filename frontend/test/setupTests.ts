import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Provide a stable window.ethereum mock for tests
(globalThis as any).ethereum = {
    request: vi.fn().mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['0xabcdefabcdef'];
        return [];
    }),
};

// Mock fetch to avoid network calls in unit tests
(globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false });

// Mock ethers to a simple, safe provider/contract implementation
vi.mock('ethers', () => {
    class BrowserProvider {
        constructor(public _eth: any) { }
        async getBalance(_addr: string) { return 0n; }
        async getHistory(_addr: string) { return []; }
    }
    class Contract {
        constructor() { }
        async balanceOf() { return 0n; }
        async decimals() { return 18; }
    }
    return {
        ethers: {
            BrowserProvider,
            Contract,
            formatEther: (_v: any) => '0',
            formatUnits: (_v: any, _d?: any) => '0',
        }
    };
});

// By default, stub the loadOnchain helper in unit tests so components render without on-chain calls
vi.mock('../src/lib/loadOnchain', () => ({
    default: vi.fn().mockResolvedValue(undefined),
}));
