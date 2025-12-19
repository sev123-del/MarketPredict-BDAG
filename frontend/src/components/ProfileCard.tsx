import { useEffect, useState } from 'react';

export default function ProfileCard({ compact = false }: { compact?: boolean }) {
    const [address, setAddress] = useState<string>('');
    const [ens, setEns] = useState<string>('');

    useEffect(() => {
        (async () => {
            try {
                if (typeof window === 'undefined') return;
                if (!(window as any).ethereum) return;
                const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
                if (accounts && accounts.length) {
                    setAddress(accounts[0]);
                }
            } catch (e) {
                // ignore
            }
        })();
    }, []);

    return (
        <div className={`p-4 rounded-lg bg-slate-800 text-white ${compact ? 'w-48' : 'w-full'}`}>
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00FFA3] to-[#0072FF]" />
                <div className="flex-1">
                    <div className="font-semibold truncate">{ens || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected')}</div>
                    <div className="text-sm text-slate-400">{address ? 'Connected wallet' : 'No wallet'}</div>
                </div>
            </div>
        </div>
    );
}
