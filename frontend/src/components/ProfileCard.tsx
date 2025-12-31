import { useEffect, useState } from 'react';

type InjectedEthereum = { request?: (opts: { method: string }) => Promise<unknown> };

export default function ProfileCard({ compact = false }: { compact?: boolean }) {
    const [address, setAddress] = useState<string>('');
    const [ens, setEns] = useState<string>('');

    useEffect(() => {
        (async () => {
            try {
                if (typeof window === 'undefined') return;
                const w = window as unknown as { ethereum?: InjectedEthereum };
                if (!w.ethereum || typeof w.ethereum.request !== 'function') return;
                const accounts = await w.ethereum.request({ method: 'eth_accounts' });
                if (Array.isArray(accounts) && accounts.length) {
                    setAddress(String(accounts[0]));
                }
            } catch (_e) {
                // ignore
            }
        })();
    }, []);

    return (
        <div className={`p-4 rounded-lg mp-panel ${compact ? 'w-48' : 'w-full'}`} style={{ color: 'var(--mp-fg)' }}>
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00FFA3] to-[#0072FF]" />
                <div className="flex-1">
                    <div className="font-semibold truncate">{ens || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected')}</div>
                    <div className="text-sm mp-text-muted">{address ? 'Connected wallet' : 'No wallet'}</div>
                </div>
            </div>
        </div>
    );
}
