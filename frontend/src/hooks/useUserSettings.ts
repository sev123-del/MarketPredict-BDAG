import { useEffect, useState } from 'react';

export type UserSettings = {
    theme: 'system' | 'light' | 'dark';
    oddsDisplay: 'percent' | 'fraction';
    network: string;
    timezone?: 'system' | string;
    username?: string;
    avatarSeed?: string;
    showInitials?: boolean;
    avatarSaltIndex?: number;
};

const STORAGE_KEY = 'mp_user_settings';

export function getDefaultSettings(): UserSettings {
    return {
        theme: 'system',
        oddsDisplay: 'percent',
        network: 'default',
        timezone: 'system',
        username: undefined,
        avatarSeed: undefined,
        showInitials: false,
        avatarSaltIndex: 0,
    };
}

export const MAX_AVATAR_SALTS = 9;

export function useUserSettings() {
    const [settings, setSettings] = useState<UserSettings>(getDefaultSettings());

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<UserSettings>;
                // previous face-related fields removed; ignore unknown fields
                // normalize avatarSaltIndex into valid range
                try {
                    const MAX_SALT = MAX_AVATAR_SALTS;
                    if (typeof parsed.avatarSaltIndex === 'number') {
                        const p = parsed.avatarSaltIndex;
                        parsed.avatarSaltIndex = ((p % MAX_SALT) + MAX_SALT) % MAX_SALT;
                    }
                } catch { }
                setSettings((s) => ({ ...s, ...parsed }));
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            try {
                window.dispatchEvent(new Event('mp_user_settings_updated'));
            } catch {
                // ignore
            }
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
