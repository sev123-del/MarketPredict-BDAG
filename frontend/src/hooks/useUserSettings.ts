import { useEffect, useState } from 'react';

export type UserSettings = {
    theme: 'system' | 'light' | 'dark';
    oddsDisplay: 'percent' | 'fraction';
    network: string;
    username?: string;
    avatarSeed?: string;
    showInitials?: boolean;
    // face-related emoji/avatar customizations removed
};

const STORAGE_KEY = 'mp_user_settings';

export function getDefaultSettings(): UserSettings {
    return {
        theme: 'system',
        oddsDisplay: 'percent',
        network: 'default',
        username: undefined,
        avatarSeed: undefined,
        showInitials: false,
        // face-related defaults removed
    };
}

export function useUserSettings() {
    const [settings, setSettings] = useState<UserSettings>(getDefaultSettings());

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<UserSettings>;
                // previous face-related fields removed; ignore unknown fields
                setSettings((s) => ({ ...s, ...parsed }));
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // ignore
        }
    }, [settings]);

    function resetSettings() {
        const d = getDefaultSettings();
        setSettings(d);
    }

    return { settings, setSettings, resetSettings } as const;
}
