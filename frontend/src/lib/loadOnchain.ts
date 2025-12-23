import { ethers } from 'ethers';

type Handlers = {
    setLoading: (v: boolean) => void;
    setEthBalance: (v: string) => void;
    setTxs: (v: any[]) => void;
    setTokenBalances: (v: any[]) => void;
    setTokenPrices: (v: Record<string, number>) => void;
    setPortfolioUsd: (v: number) => void;
};

export async function loadOnchain(ethereum: any, addr: string, handlers: Handlers, curatedTokens: any[] = []) {
    const { setLoading, setEthBalance, setTxs, setTokenBalances, setTokenPrices, setPortfolioUsd } = handlers;
    setLoading(true);
    try {
        const provider = new ethers.BrowserProvider(ethereum);
        const b = await provider.getBalance(addr);
        setEthBalance(ethers.formatEther(b));

        if ((provider as any).getHistory) {
            try {
                const history = await (provider as any).getHistory(addr);
                setTxs(history.slice(-10).reverse().map((t: any) => ({
                    hash: t.hash,
                    value: ethers.formatEther(t.value || 0),
                    timestamp: (t.timestamp || Date.now() / 1000) * 1000,
                    from: t.from,
                    to: t.to,
                })));
            } catch (_e) {
                // ignore
            }
        }

        try {
            const erc20Abi = [
                'function balanceOf(address) view returns (uint256)',
                'function decimals() view returns (uint8)'
            ];
            const out: any[] = [];
            for (const t of curatedTokens) {
                try {
                    const c = new ethers.Contract(t.address, erc20Abi, provider);
                    const raw = await c.balanceOf(addr);
                    const dec = t.decimals ?? (await c.decimals().catch(() => t.decimals));
                    const formatted = Number(ethers.formatUnits(raw, dec));
                    out.push({ symbol: t.symbol, balance: formatted, address: (t.address || '').toLowerCase() });
                } catch (_e) {
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
                        const item = pj[key];
                        if (item && (item as any).usd) map[key.toLowerCase()] = Number((item as any).usd);
                    }
                    setTokenPrices(map);
                    let total = 0;
                    for (const t of out) {
                        const p = map[(t.address || '').toLowerCase()] || 0;
                        total += (p * (t.balance || 0));
                    }
                    setPortfolioUsd(total);
                }
            } catch (_e) {
                // ignore pricing errors
            }
        } catch (_e) {
            // ignore
        }
    } catch (_e) {
        console.error('loadOnchain', _e);
    } finally {
        setLoading(false);
    }
}

export default loadOnchain;
