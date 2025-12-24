import { ethers } from 'ethers';
import type { Dispatch, SetStateAction } from 'react';

type InjectedProvider = {
    request: (arg: { method: string; params?: any[] | Record<string, any> }) => Promise<unknown>;
};

type TxItem = {
    hash: string;
    value: string;
    timestamp: number;
    from?: string;
    to?: string;
};

type TokenBalance = {
    symbol?: string;
    balance: number;
    address: string;
};

type Token = {
    address: string;
    symbol?: string;
    decimals?: number;
};

type Handlers = {
    setLoading: (v: boolean) => void;
    setEthBalance: (v: string) => void;
    setTxs: Dispatch<SetStateAction<any[]>>;
    setTokenBalances: Dispatch<SetStateAction<any[]>>;
    setTokenPrices: (v: Record<string, number>) => void;
    setPortfolioUsd: (v: number) => void;
};

export async function loadOnchain(ethereum: unknown, addr: string, handlers: Handlers, curatedTokens: Token[] = []) {
    const { setLoading, setEthBalance, setTxs, setTokenBalances, setTokenPrices, setPortfolioUsd } = handlers;
    setLoading(true);
    try {
        const provider = new ethers.BrowserProvider(ethereum as unknown as InjectedProvider);
        const b = await provider.getBalance(addr);
        setEthBalance(ethers.formatEther(b));

        // Some providers expose getHistory — guard with a runtime check
        const provWithHistory = provider as unknown as { getHistory?: (a: string) => Promise<Array<Record<string, unknown>>> };
        if (typeof provWithHistory.getHistory === 'function') {
            try {
                const history = await provWithHistory.getHistory(addr);
                setTxs(history.slice(-10).reverse().map((t) => ({
                    hash: String((t as Record<string, unknown>).hash ?? ''),
                    value: ethers.formatEther(((t as Record<string, any>).value ?? 0) as any),
                    timestamp: Number(((t as Record<string, unknown>).timestamp ?? Date.now() / 1000)) * 1000,
                    from: String((t as Record<string, unknown>).from ?? ''),
                    to: String((t as Record<string, unknown>).to ?? ''),
                })));
            } catch {
                // ignore
            }
        }

        try {
            const erc20Abi = [
                'function balanceOf(address) view returns (uint256)',
                'function decimals() view returns (uint8)'
            ];
            const out: TokenBalance[] = [];
            for (const t of curatedTokens) {
                try {
                    const c = new ethers.Contract(t.address, erc20Abi, provider);
                    const raw = await c.balanceOf(addr);
                    const dec = t.decimals ?? (await c.decimals().catch(() => t.decimals));
                    const formatted = Number(ethers.formatUnits(raw, dec));
                    out.push({ symbol: t.symbol, balance: formatted, address: (t.address || '').toLowerCase() });
                } catch {
                    // ignore per-token errors
                }
            }
            setTokenBalances(out);
            try {
                const contracts = out.map(o => o.address).filter(Boolean).join(',');
                const pr = await fetch(`/api/token-prices?contracts=${contracts}`);
                if (pr.ok) {
                    const pj = await pr.json();
                    const map: Record<string, number> = {};
                    for (const key of Object.keys(pj)) {
                        const item = pj[key] as unknown;
                        const rec = item as Record<string, unknown> | null;
                        if (rec && typeof rec.usd === 'number') map[key.toLowerCase()] = Number(rec.usd);
                    }
                    setTokenPrices(map);
                    let total = 0;
                    for (const t of out) {
                        const p = map[(t.address || '').toLowerCase()] || 0;
                        total += (p * (t.balance || 0));
                    }
                    setPortfolioUsd(total);
                }
            } catch {
                // ignore pricing errors
            }
        } catch {
            // ignore
        }
    } catch (err) {
        console.error('loadOnchain', err);
    } finally {
        setLoading(false);
    }
}

export default loadOnchain;
