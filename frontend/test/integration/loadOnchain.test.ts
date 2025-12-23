import { describe, it, expect, vi } from 'vitest';

// Integration test exercising token mapping and tx parsing using the real helper
describe('loadOnchain integration', () => {
    it('parses balances, tx history and token prices', async () => {
        // Ensure we unmock the helper (setupTests stubs it)
        vi.unmock('../../src/lib/loadOnchain');
        const { default: loadOnchain } = await import('../../src/lib/loadOnchain');

        // Prepare a mocked ethereum and server responses
        const ethereum = { request: vi.fn() };

        // Mock fetch for token prices to return a sample mapping
        const mockPrices = {
            '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef': { usd: 2.5 }
        };
        (globalThis as any).fetch = vi.fn().mockImplementation((url: string) => {
            if (url.startsWith('/api/token-prices')) {
                return Promise.resolve({ ok: true, json: async () => mockPrices });
            }
            return Promise.resolve({ ok: false });
        });

        const handlers = {
            setLoading: vi.fn(),
            setEthBalance: vi.fn(),
            setTxs: vi.fn(),
            setTokenBalances: vi.fn(),
            setTokenPrices: vi.fn(),
            setPortfolioUsd: vi.fn(),
        };

        // Provide a curated token to evaluate
        const curated = [{ address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', symbol: 'TST', decimals: 18 }];

        await expect(loadOnchain(ethereum, '0xabc', handlers, curated)).resolves.not.toThrow();

        // Assertions: handlers should have been called to set balances and prices
        expect(handlers.setEthBalance).toHaveBeenCalled();
        expect(handlers.setTokenBalances).toHaveBeenCalled();
        expect(handlers.setTokenPrices).toHaveBeenCalled();
        expect(handlers.setPortfolioUsd).toHaveBeenCalled();

        // Inspect the tokenPrices handler call value
        const calledMap = (handlers.setTokenPrices as any).mock.calls[0][0];
        expect(typeof calledMap).toBe('object');
        // key should be lowercased address
        expect(calledMap['0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef']).toBe(2.5);
    });
});
