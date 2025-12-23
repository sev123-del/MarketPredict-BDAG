"use client";
import { useEffect, useState } from "react";
import Avatar from "../components/Avatar";
import { useUserSettings } from "../hooks/useUserSettings";
import ProfileCard from "../components/ProfileCard";
import { MAX_AVATAR_SALTS } from "../hooks/useUserSettings";
import { ethers } from "ethers";
import { CURATED_TOKENS } from "../configs/tokens";

export default function ProfilePage() {
  const { settings, setSettings } = useUserSettings();
  const [account, setAccount] = useState<string>("");
  const [ethBalance, setEthBalance] = useState<string>("");
  const [bdagBalance, setBdagBalance] = useState<string>("");
  const [txs, setTxs] = useState<any[]>([]);
  const [tokenBalances, setTokenBalances] = useState<any[]>([]);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [portfolioUsd, setPortfolioUsd] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState(settings.username || "");
  const [avatarPref, setAvatarPref] = useState<string>('auto');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('mp_avatar_pref') || 'auto';
      setAvatarPref(stored);
    } catch (_e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      try {
        const accounts = await (window as any).ethereum?.request?.({ method: "eth_accounts" }) || [];
        if (accounts && accounts.length) {
          const addr = accounts[0];
          setAccount(addr);
          await loadOnchain(addr);
          // fetch BDAG balance from server-side RPC
          fetch(`/api/bdag-balance?address=${addr}`).then(async (r) => {
            if (!r.ok) return;
            try {
              const j = await r.json();
              if (j.balance) setBdagBalance(j.balance);
            } catch (_e) {
              // ignore
            }
          }).catch(() => { });
        }
      } catch (_e) {
        // ignore
      }
    })();
  }, []);

  async function connect() {
    if (!(window as any).ethereum) {
      alert("Please install MetaMask");
      return;
    }
    try {
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length) {
        setAccount(accounts[0]);
        await loadOnchain(accounts[0]);
      }
    } catch (_e) {
      console.error(_e);
    }
  }
  function disconnect() {
    setAccount("");
    setEthBalance("");
    setTxs([]);
  }

  async function loadOnchain(addr: string) {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const b = await provider.getBalance(addr);
      setEthBalance(ethers.formatEther(b));
      // try to fetch transaction history if provider supports it
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
          // ignore history errors
        }
      }

      // quick curated token balances via on-chain calls (no external API)
      try {
        const erc20Abi = [
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ];
        const out: any[] = [];
        for (const t of CURATED_TOKENS) {
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
        // fetch prices for curated tokens (uses server-side CoinGecko proxy)
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
            // compute USD portfolio
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
      console.error("loadOnchain", _e);
    } finally {
      setLoading(false);
    }
  }

  // fetch BDAG balance (manual refresh)
  async function refreshBdag(addr: string) {
    try {
      const r = await fetch(`/api/bdag-balance?address=${addr}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j.balance) setBdagBalance(j.balance);
    } catch (_e) {
      // ignore
    }
  }

  function saveProfile() {
    setSettings({ ...settings, username });
    alert("Saved (local-only)");
  }

  return (
  // Hide full profile content for users without a connected wallet — prompt to connect.
  if (!account) {
    return (
      <main className="min-h-screen px-4 sm:px-6 pt-20 pb-20 relative z-10">
        <div className="mx-auto max-w-2xl">
          <div className="p-6 rounded-lg bg-slate-800 text-white text-center">
            <h2 className="text-xl font-semibold mb-2">Connect Wallet</h2>
            <p className="text-sm text-slate-400 mb-4">You must connect a wallet to view and edit profile settings.</p>
            <div className="flex justify-center">
              <button onClick={connect} className="px-4 py-2 rounded bg-green-600">Connect Wallet</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 pt-20 pb-20 relative z-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Profile</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 space-y-4">
            <div className="p-4 rounded-lg bg-slate-800 text-white">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    seed={settings.avatarSeed || (account || username || "anon")}
                    saltIndex={settings.avatarSaltIndex ?? 0}
                    size={72}
                    variant={avatarPref as any}
                    displayName={settings.showInitials ? (username || settings.username) : undefined}
                  />
                  <div className="text-sm text-slate-400">Salt: <span className="font-mono">{settings.avatarSaltIndex ?? 0}</span></div>
                </div>
                <div className="flex-1">
                  <div className="font-semibold truncate">{username || (account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Not connected')}</div>
                  <div className="text-sm text-slate-400">{account ? 'Connected wallet' : 'No wallet'}</div>
                </div>
              </div>
            </div>

            <ProfileCard />
          </div>

          <div className="col-span-2 space-y-6">
            <div className="p-6 bg-slate-800 rounded-lg text-white">
              <h3 className="font-semibold mb-3">Wallet</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400">Status</div>
                  <div className="font-mono mt-1">{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Not connected'}</div>
                </div>
                <div className="flex items-center gap-3">
                  {account ? (
                    <button className="px-4 py-2 rounded bg-red-600" onClick={disconnect}>Disconnect</button>
                  ) : (
                    <button className="px-4 py-2 rounded bg-green-600" onClick={connect}>Connect Wallet</button>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <button
                  className="px-3 py-2 bg-rose-600 rounded text-sm"
                  onClick={() => {
                    // clear local data and settings
                    try { localStorage.removeItem('mp_user_settings'); } catch (_e) { }
                    try { localStorage.removeItem('mp_portfolio_cache'); } catch (_e) { }
                    setTokenBalances([]);
                    setEthBalance('');
                    setBdagBalance('');
                    alert('Local data cleared');
                  }}
                >Clear local data</button>
              </div>
              <div className="mt-4">
                <div className="text-sm text-slate-400">ETH Balance</div>
                <div className="font-semibold">{loading ? 'Loading...' : ethBalance ? `${Number(ethBalance).toFixed(4)} ETH` : '—'}</div>
              </div>
              <div className="mt-2">
                <div className="text-sm text-slate-400">BDAG (testnet)</div>
                <div className="flex items-center gap-3">
                  <div className="font-semibold">{bdagBalance ? `${Number(bdagBalance) / 1e18} BDAG` : '—'}</div>
                  {account && (
                    <button className="px-3 py-1 bg-slate-700 rounded text-sm" onClick={() => refreshBdag(account)}>Refresh</button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-800 rounded-lg text-white">
              <h3 className="font-semibold mb-3">Account Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-300">Username (optional)</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-2 w-full p-2 rounded bg-slate-700" />
                </div>

                <div>
                  <label className="block text-sm text-slate-300">Avatar</label>
                  <div className="mt-2">
                    <div className="flex items-start gap-6">
                      {(() => {
                        const base = (username || account || 'anon');
                        const types: { key: 'auto' | 'jazzicon' | 'boring' | 'multi'; label: string }[] = [
                          { key: 'jazzicon', label: 'Jazz' },
                          { key: 'boring', label: 'Boring' },
                          { key: 'multi', label: 'Multi' },
                        ];
                        return types.map(t => (
                          <div key={t.key} className="flex-1">
                            <div className="text-xs text-slate-300 mb-2">{t.label}</div>
                            <div className="grid grid-cols-3 gap-2">
                              {Array.from({ length: MAX_AVATAR_SALTS }).map((_, i) => {
                                const selected = (settings.avatarSaltIndex ?? 0) === i && avatarPref === t.key;
                                return (
                                  <button
                                    key={i}
                                    onClick={() => {
                                      try { setSettings({ ...settings, avatarSeed: base, avatarSaltIndex: i }); } catch (_e) { }
                                      try { window.localStorage.setItem('mp_avatar_pref', t.key); } catch (_e) { }
                                      setAvatarPref(t.key);
                                    }}
                                    className={`rounded p-1 ring-0 ${selected ? 'ring-2 ring-sky-500' : ''}`}
                                  >
                                    <Avatar seed={base} saltIndex={i} size={48} variant={t.key as any} displayName={settings.showInitials ? (username || settings.username) : undefined} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    <div className="text-xs text-slate-400 mt-2">Saved locally. Avatars are generated locally and stored in your browser.</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button className="px-4 py-2 rounded bg-blue-600" onClick={saveProfile}>Save</button>
                  <button className="px-4 py-2 rounded bg-gray-600" onClick={() => { setUsername(settings.username || ''); }}>Reset</button>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-800 rounded-lg text-white">
              <h3 className="font-semibold mb-3">Transactions (recent)</h3>
              {txs.length === 0 ? (
                <div className="text-sm text-slate-400">No transaction history available or wallet provider does not expose history.</div>
              ) : (
                <ul className="space-y-3">
                  {txs.map(t => (
                    <li key={t.hash} className="flex justify-between items-center">
                      <div>
                        <div className="font-mono text-sm">{t.hash.slice(0, 10)}...</div>
                        <div className="text-xs text-slate-400">{t.from === account ? 'Sent' : 'Received'} • {new Date(t.timestamp).toLocaleString()}</div>
                      </div>
                      <div className="font-semibold">{Number(t.value).toFixed(4)} ETH</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-6 bg-slate-800 rounded-lg text-white">
              <h3 className="font-semibold mb-3">Curated Token Balances</h3>
              {tokenBalances.length === 0 ? (
                <div className="text-sm text-slate-400">No token balances or provider did not respond.</div>
              ) : (
                <ul className="space-y-2">
                  {tokenBalances.map(t => (
                    <li key={t.symbol} className="flex justify-between">
                      <div className="font-medium">{t.symbol}</div>
                      <div className="text-right">
                        <div className="font-semibold">{Number(t.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
                        <div className="text-xs text-slate-400">${((tokenPrices[(t.address || '').toLowerCase()] || 0) * t.balance).toFixed(2)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="text-xs text-slate-400 mt-2">Portfolio USD: ${portfolioUsd.toFixed(2)} — For a full portfolio (prices & all tokens) enable external API in settings (server-side key required).</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
