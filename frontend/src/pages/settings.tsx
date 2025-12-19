"use client";
import Link from 'next/link';
import ProfileCard from '../components/ProfileCard';
import { useUserSettings } from '../hooks/useUserSettings';

export default function SettingsPage() {
    const { settings, setSettings, resetSettings } = useUserSettings();

    return (
        <div className="mx-auto max-w-4xl p-6">
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Settings</h2>
                <Link href="/" className="text-sm text-slate-400">Back</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-1">
                    <ProfileCard />
                </div>
                <div className="col-span-2">
                    <div className="p-6 bg-slate-800 rounded-lg text-white">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-300">Theme</label>
                                <select
                                    value={settings.theme}
                                    onChange={(e) => setSettings({ ...settings, theme: e.target.value as any })}
                                    className="mt-2 w-full p-2 rounded bg-slate-700"
                                >
                                    <option value="system">System</option>
                                    <option value="light">Light</option>
                                    <option value="dark">Dark</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-300">Odds Display</label>
                                <select
                                    value={settings.oddsDisplay}
                                    onChange={(e) => setSettings({ ...settings, oddsDisplay: e.target.value as any })}
                                    className="mt-2 w-full p-2 rounded bg-slate-700"
                                >
                                    <option value="percent">Percent</option>
                                    <option value="fraction">Fraction</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-300">Network Preference</label>
                                <input
                                    value={settings.network}
                                    onChange={(e) => setSettings({ ...settings, network: e.target.value })}
                                    className="mt-2 w-full p-2 rounded bg-slate-700"
                                />
                                <div className="text-xs text-slate-400 mt-1">Set a preferred network label (local-only).</div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-700"
                                    onClick={() => { resetSettings(); }}
                                >
                                    Reset
                                </button>
                                <div className="text-sm text-slate-400">Settings persist in your browser only.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
