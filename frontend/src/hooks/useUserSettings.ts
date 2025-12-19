import { useEffect, useState } from 'react';

export type UserSettings = {
    theme: 'system' | 'light' | 'dark';
    oddsDisplay: 'percent' | 'fraction';
    network: string;
    username?: string;
    avatarSeed?: string;
};

const STORAGE_KEY = 'mp_user_settings';

export function getDefaultSettings(): UserSettings {
    return { theme: 'system', oddsDisplay: 'percent', network: 'default', username: undefined, avatarSeed: undefined };
}

export function useUserSettings() {
    const [settings, setSettings] = useState<UserSettings>(getDefaultSettings());

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as UserSettings;
                setSettings((s) => ({ ...s, ...parsed }));
            }
        } catch (_e) {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (_e) {
            // ignore
        }
    }, [settings]);

    function resetSettings() {
        const d = getDefaultSettings();
        setSettings(d);
    }

    return { settings, setSettings, resetSettings } as const;
}
