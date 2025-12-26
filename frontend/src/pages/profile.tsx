"use client";
import { useEffect, useState, useCallback } from "react";
import Avatar from "../components/Avatar";
import { useUserSettings } from "../hooks/useUserSettings";
import { MAX_AVATAR_SALTS } from "../hooks/useUserSettings";
import { CURATED_TOKENS } from "../configs/tokens";
import loadOnchain from '../lib/loadOnchain';
import type { TokenBalance, TxItem } from '../types/onchain';

type InjectedEthereum = {
  request?: (opts: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
};

const getInjectedEthereum = (): InjectedEthereum | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ethereum?: InjectedEthereum }).ethereum;
};

type Tx = TxItem;
type AvatarVariant = 'auto' | 'jazzicon' | 'boring' | 'multi';

export default function ProfilePage() {
  const { settings, setSettings } = useUserSettings();
  const [account, setAccount] = useState<string>("");
  const [ethBalance, setEthBalance] = useState<string>("");
  const [bdagBalance, setBdagBalance] = useState<string>("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [portfolioUsd, setPortfolioUsd] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState(settings.username || "");
  const [avatarPref, setAvatarPref] = useState<AvatarVariant>('auto');

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('mp_avatar_pref') || 'auto' : 'auto';
      setAvatarPref(stored as AvatarVariant);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      try {
        const eth = getInjectedEthereum();
        const accounts = eth?.request ? (await eth.request({ method: 'eth_accounts' }) as string[]) : [];
        if (accounts && accounts.length) {
          const addr = accounts[0];
          setAccount(addr);
          await loadOnchain(eth, addr, { setLoading, setEthBalance, setTxs, setTokenBalances, setTokenPrices, setPortfolioUsd }, CURATED_TOKENS);
          // fetch BDAG balance from server-side RPC
          fetch(`/api/bdag-balance?address=${addr}`).then(async (r) => {
            if (!r.ok) return;
            try {
              const j = await r.json();
              if (j.balance) setBdagBalance(j.balance);
            } catch {
              // ignore
            }
          }).catch(() => { });
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const connect = useCallback(async () => {
    const eth = getInjectedEthereum();
    if (!eth) {
      alert("Please install MetaMask");
      return;
    }
    try {
      const accounts = await eth.request?.({ method: "eth_requestAccounts" }) as string[];
      if (accounts && accounts.length) {
        setAccount(accounts[0]);
        await loadOnchain(eth, accounts[0], { setLoading, setEthBalance, setTxs, setTokenBalances, setTokenPrices, setPortfolioUsd }, CURATED_TOKENS);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);
  function disconnect() {
    setAccount("");
    setEthBalance("");
    setTxs([]);
  }

  // fetch BDAG balance (manual refresh)
  const refreshBdag = useCallback(async (addr: string) => {
    try {
      const r = await fetch(`/api/bdag-balance?address=${addr}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j.balance) setBdagBalance(j.balance);
    } catch (e) {
      // ignore
    }
  }, []);

  const saveProfile = useCallback(() => {
    setSettings({ ...settings, username });
    alert("Saved (local-only)");
  }, [settings, username, setSettings]);

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
                    variant={avatarPref as AvatarVariant}
                    displayName={settings.showInitials ? (username || settings.username) : undefined}
                  />
                </div>
                <div className="flex-1">
                  <div className="font-semibold truncate">{username || (account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Not connected')}</div>
                  <div className="text-sm text-slate-400">{account ? 'Connected wallet' : 'No wallet'}</div>
                </div>
              </div>
            </div>

          </div>

          <div className="col-span-2 space-y-6">
            <div className="p-6 bg-slate-800 rounded-lg text-white">
              <div className="flex items-center mb-3 gap-3">
                <h3 className="font-semibold">Wallet</h3>
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
                    try { localStorage.removeItem('mp_user_settings'); } catch { }
                    try { localStorage.removeItem('mp_portfolio_cache'); } catch { }
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
                    <div className="inline-grid grid-flow-col auto-cols-max gap-1">
                      {(() => {
                        const base = (username || account || 'anon');
                        const types: { key: 'auto' | 'jazzicon' | 'boring' | 'multi'; label: string }[] = [
                          { key: 'multi', label: 'Multi' },
                          { key: 'jazzicon', label: 'Jazz' },
                          { key: 'boring', label: 'Boring' },
                        ];
                        return types.map(t => (
                          <div key={t.key} className="w-fit">
                            <div className="text-xs text-slate-300 mb-2">{t.label}</div>
                            <div className="grid grid-cols-3 gap-1 justify-items-center">
                              {Array.from({ length: MAX_AVATAR_SALTS }).map((_, i) => {
                                const selected = (settings.avatarSaltIndex ?? 0) === i && avatarPref === t.key;
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    aria-pressed={selected}
                                    aria-label={`Select ${t.label} avatar ${i + 1}`}
                                    onClick={() => {
                                      try { setSettings({ ...settings, avatarSeed: base, avatarSaltIndex: i }); } catch { }
                                      try { window.localStorage.setItem('mp_avatar_pref', t.key); } catch { }
                                      setAvatarPref(t.key);
                                    }}
                                    className={`rounded p-1 w-14 h-14 flex items-center justify-center ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${selected ? 'ring-2 ring-sky-500' : ''}`}
                                  >
                                    <Avatar seed={base} saltIndex={i} size={48} variant={t.key as AvatarVariant} displayName={settings.showInitials ? (username || settings.username) : undefined} />
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
                        <div className="text-xs text-slate-400">
                          {(t.from && account && t.from.toLowerCase() === account.toLowerCase()) ? 'Sent' : (t.from ? 'Received' : 'Unknown')} • {new Date(t.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className="font-semibold">{Number(t.value).toFixed(4)} ETH</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Curated Token Balances removed per request */}
          </div>
        </div>
      </div>
    </main>
  );
}
