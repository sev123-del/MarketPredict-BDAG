"use client";
import { useEffect, useState, useCallback } from "react";
import Link from 'next/link';
import Avatar from "../components/Avatar";
import { useUserSettings } from "../hooks/useUserSettings";
import { MAX_AVATAR_SALTS } from "../hooks/useUserSettings";

type InjectedEthereum = {
  request?: (opts: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
};

const getInjectedEthereum = (): InjectedEthereum | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ethereum?: InjectedEthereum }).ethereum;
};

type AvatarVariant = 'auto' | 'multi';

export default function ProfilePage() {
  const { settings, setSettings } = useUserSettings();
  const [account, setAccount] = useState<string>("");
  const [username, setUsername] = useState(settings.username || "");
  const [avatarPref, setAvatarPref] = useState<AvatarVariant>('multi');
  const [notice, setNotice] = useState<string>('');
  const [noticeType, setNoticeType] = useState<'success' | 'error' | ''>('');

  const showNotice = useCallback((message: string, type: 'success' | 'error') => {
    setNotice(message);
    setNoticeType(type);
    setTimeout(() => {
      setNotice('');
      setNoticeType('');
    }, 6000);
  }, []);

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('mp_avatar_pref') || 'multi' : 'multi';
      // Force Multi avatar preference (stored locally).
      const next: AvatarVariant = stored === 'multi' ? 'multi' : 'multi';
      setAvatarPref(next);
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem('mp_avatar_pref', next);
      } catch {
        // ignore
      }
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
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const connect = useCallback(async () => {
    const eth = getInjectedEthereum();
    if (!eth) {
      showNotice('No wallet detected. Install MetaMask (or a compatible wallet) to continue.', 'error');
      return;
    }
    try {
      const accounts = await eth.request?.({ method: "eth_requestAccounts" }) as string[];
      if (accounts && accounts.length) {
        setAccount(accounts[0]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [showNotice]);
  function disconnect() {
    setAccount("");
  }

  const saveProfile = useCallback(() => {
    const trimmed = String(username || '').trim();
    if (!trimmed) {
      showNotice('Username is required.', 'error');
      return;
    }
    setUsername(trimmed);
    setSettings({ ...settings, username: trimmed });
    showNotice('Saved locally.', 'success');
  }, [settings, username, setSettings, showNotice]);

  // Hide full profile content for users without a connected wallet — prompt to connect.
  if (!account) {
    return (
      <main className="min-h-screen px-4 sm:px-6 pt-1 pb-20 relative z-10">
        <div className="mx-auto max-w-2xl">
          <div className="p-6 rounded-lg mp-panel text-center" style={{ color: 'var(--mp-fg)' }}>
            <h2 className="text-xl font-semibold mb-2">Connect Wallet</h2>
            <p className="text-sm mp-text-muted mb-4">You must connect a wallet to view and edit profile settings.</p>
            {notice && (
              <div className={`mb-4 p-3 rounded-lg border text-sm ${noticeType === 'error' ? 'border-orange-500/40 bg-orange-500/10 text-orange-200' : 'border-green-500/40 bg-green-500/10 text-green-200'}`}>
                {notice}
              </div>
            )}
            <div className="flex justify-center">
              <button onClick={connect} className="px-4 py-2 rounded bg-green-600">Connect Wallet</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 pt-1 pb-20 relative z-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Profile</h2>
        </div>

        {notice && (
          <div className={`mb-6 p-3 rounded-lg border text-sm ${noticeType === 'error' ? 'border-orange-500/40 bg-orange-500/10 text-orange-200' : 'border-green-500/40 bg-green-500/10 text-green-200'}`}>
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 space-y-4">
            <div className="p-4 rounded-lg mp-panel" style={{ color: 'var(--mp-fg)' }}>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    seed={settings.avatarSeed ?? (username || account || "anon")}
                    saltIndex={settings.avatarSaltIndex ?? 0}
                    size={72}
                    variant={avatarPref as AvatarVariant}
                    displayName={settings.showInitials ? (username || settings.username) : undefined}
                  />
                </div>
                <div className="flex-1">
                  <div className="font-semibold truncate">{username || (account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Not connected')}</div>
                  <div className="text-sm mp-text-muted">{account ? 'Connected wallet' : 'No wallet'}</div>
                </div>
              </div>
            </div>

          </div>

          <div className="col-span-2 space-y-6">
            <div className="p-6 rounded-lg mp-panel" style={{ color: 'var(--mp-fg)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Wallet</h3>
                <div className="flex items-center gap-3 pl-4">
                  {account ? (
                    <button className="px-4 py-2 rounded bg-red-600" onClick={disconnect}>Disconnect</button>
                  ) : (
                    <button className="px-4 py-2 rounded bg-green-600" onClick={connect}>Connect Wallet</button>
                  )}
                </div>
              </div>

              <div className="text-sm mp-text-muted">
                View balances and transactions on the Wallet page.
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Link href="/wallet" className="px-4 py-2 rounded bg-sky-600 text-white text-sm font-semibold">
                  Go to Wallet
                </Link>
              </div>
            </div>

            <div className="p-6 rounded-lg mp-panel" style={{ color: 'var(--mp-fg)' }}>
              <h3 className="font-semibold mb-3">Account Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm mp-text-muted">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-2 w-full p-2 rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 placeholder:text-[color:var(--mp-fg-muted)]"
                    style={{ backgroundColor: 'var(--mp-bg)', color: 'var(--mp-fg)', borderColor: 'var(--mp-border)' }}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm mp-text-muted">Avatar</label>
                  <div className="mt-2">
                    <div className="inline-grid grid-flow-col auto-cols-max gap-1">
                      {(() => {
                        const base = (username || account || 'anon');
                        const types: { key: 'multi'; label: string }[] = [
                          { key: 'multi', label: 'Multi' },
                        ];
                        return types.map(t => (
                          <div key={t.key} className="w-fit">
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
                    <div className="text-xs mp-text-muted mt-2">Avatars are generated and stored on your device.</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button className="px-4 py-2 rounded bg-blue-600" onClick={saveProfile}>Save</button>
                </div>
              </div>
            </div>

            {/* Curated Token Balances removed per request */}
          </div>
        </div>
      </div>
    </main>
  );
}
