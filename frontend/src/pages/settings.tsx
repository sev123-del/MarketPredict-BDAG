"use client";
import Link from 'next/link';
import ProfileCard from '../components/ProfileCard';
import { useUserSettings, UserSettings } from '../hooks/useUserSettings';
import { useEffect, useMemo, useState } from 'react';
import { blockdagTestnet } from '../chains';

type EthereumLike = {
    request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export default function SettingsPage() {
    const { settings, setSettings, resetSettings } = useUserSettings();
    const [notice, setNotice] = useState<string>('');
    const [chainIdHex, setChainIdHex] = useState<string | null>(null);

    const timezoneValue = settings.timezone || 'system';

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const w = window as unknown as { ethereum?: EthereumLike };
        const eth = w.ethereum;
        if (!eth || typeof eth.request !== 'function') {
            setChainIdHex(null);
            return;
        }

        let cancelled = false;

        const refresh = async () => {
            try {
                const id = await eth.request!({ method: 'eth_chainId' });
                if (!cancelled) setChainIdHex(typeof id === 'string' ? id : String(id));
            } catch {
                if (!cancelled) setChainIdHex(null);
            }
        };

        const onChainChanged = (...args: unknown[]) => {
            const id = args[0];
            setChainIdHex(typeof id === 'string' ? id : String(id));
        };

        refresh();

        try {
            eth.on?.('chainChanged', onChainChanged);
        } catch {
            // ignore
        }

        return () => {
            cancelled = true;
            try {
                eth.removeListener?.('chainChanged', onChainChanged);
            } catch {
                // ignore
            }
        };
    }, []);

    const connectedNetworkLabel = useMemo(() => {
        if (!chainIdHex) return 'Not available (connect a wallet)';
        const asNumber = Number.parseInt(chainIdHex, 16);
        if (!Number.isNaN(asNumber) && asNumber === blockdagTestnet.id) {
            return `${blockdagTestnet.name} (chainId ${blockdagTestnet.id})`;
        }
        if (!Number.isNaN(asNumber)) {
            return `Chain ${asNumber} (${chainIdHex})`;
        }
        return `Chain (${chainIdHex})`;
    }, [chainIdHex]);

    return (
        <main className="min-h-screen px-4 sm:px-6 pt-1 pb-20 relative z-10">
            <div className="mx-auto max-w-4xl">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Settings</h2>
                    <Link href="/" className="text-sm text-slate-400">Back</Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="col-span-1">
                        <ProfileCard />
                    </div>
                    <div className="col-span-2">
                        <div
                            className="p-6 rounded-lg"
                            style={{
                                background: 'var(--mp-surface)',
                                border: '1px solid var(--mp-border)',
                                color: 'var(--mp-fg)',
                            }}
                        >
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm" style={{ color: 'var(--mp-fg-muted)' }}>Theme</label>
                                    <select
                                        value={settings.theme}
                                        onChange={(e) => setSettings({ ...settings, theme: e.target.value as UserSettings['theme'] })}
                                        className="mt-2 w-full p-2 rounded"
                                        style={{
                                            background: 'var(--mp-surface-2)',
                                            color: 'var(--mp-fg)',
                                            border: '1px solid var(--mp-border)',
                                        }}
                                    >
                                        <option value="system">System</option>
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm" style={{ color: 'var(--mp-fg-muted)' }}>Odds Display</label>
                                    <select
                                        value={settings.oddsDisplay}
                                        onChange={(e) => setSettings({ ...settings, oddsDisplay: e.target.value as UserSettings['oddsDisplay'] })}
                                        className="mt-2 w-full p-2 rounded"
                                        style={{
                                            background: 'var(--mp-surface-2)',
                                            color: 'var(--mp-fg)',
                                            border: '1px solid var(--mp-border)',
                                        }}
                                    >
                                        <option value="percent">Percent</option>
                                        <option value="fraction">Fraction</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm" style={{ color: 'var(--mp-fg-muted)' }}>Timezone</label>
                                    <select
                                        value={timezoneValue}
                                        onChange={(e) => setSettings({ ...settings, timezone: e.target.value as UserSettings['timezone'] })}
                                        className="mt-2 w-full p-2 rounded"
                                        style={{
                                            background: 'var(--mp-surface-2)',
                                            color: 'var(--mp-fg)',
                                            border: '1px solid var(--mp-border)',
                                        }}
                                    >
                                        <option value="system">Your Local Time</option>
                                        <option value="America/New_York">Eastern (ET)</option>
                                        <option value="America/Chicago">Central (CT)</option>
                                        <option value="America/Denver">Mountain (MT)</option>
                                        <option value="America/Los_Angeles">Pacific (PT)</option>
                                        <option value="Europe/London">London (GMT)</option>
                                        <option value="Europe/Paris">Paris (CET)</option>
                                        <option value="Asia/Tokyo">Tokyo (JST)</option>
                                        <option value="Asia/Dubai">Dubai (GST)</option>
                                        <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                                        <option value="Australia/Sydney">Sydney (AEDT)</option>
                                    </select>
                                    <div className="text-xs mt-1" style={{ color: 'var(--mp-fg-muted)' }}>
                                        Used to display market closing times.
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm" style={{ color: 'var(--mp-fg-muted)' }}>Connected Network</label>
                                    <div
                                        className="mt-2 w-full p-2 rounded"
                                        style={{
                                            background: 'var(--mp-surface-2)',
                                            color: 'var(--mp-fg)',
                                            border: '1px solid var(--mp-border)',
                                        }}
                                    >
                                        {connectedNetworkLabel}
                                    </div>
                                    <div className="text-xs mt-1" style={{ color: 'var(--mp-fg-muted)' }}>
                                        This comes from your wallet (your wallet controls which network you’re connected to).
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        className="px-4 py-2 rounded bg-red-600 hover:bg-red-700"
                                        onClick={() => {
                                            resetSettings();
                                            setNotice('Settings reset.');
                                            setTimeout(() => setNotice(''), 5000);
                                        }}
                                    >
                                        Reset Settings
                                    </button>
                                    <div className="text-sm" style={{ color: 'var(--mp-fg-muted)' }}>
                                        {notice || 'Settings persist on your device only.'}
                                    </div>
                                </div>
                                <div className="text-xs" style={{ color: 'var(--mp-fg-muted)' }}>
                                    Reset Settings restores theme/odds/network defaults (does not reset username or avatar). Cache clearing is available on the Wallet page.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
