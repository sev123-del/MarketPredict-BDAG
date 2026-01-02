'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'mp_user_settings';

type ThemePref = 'system' | 'light' | 'dark';

function readThemePref(): ThemePref {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return 'system';
        const parsed = JSON.parse(raw) as { theme?: unknown };
        const t = String(parsed?.theme || 'system');
        if (t === 'light' || t === 'dark' || t === 'system') return t;
    } catch {
        // ignore
    }
    return 'system';
}

function applyThemePref(theme: ThemePref) {
    const root = document.documentElement;
    if (theme === 'system') {
        root.removeAttribute('data-theme');
    } else {
        root.dataset.theme = theme;
    }
}

export default function ThemeApplier() {
    useEffect(() => {
        const apply = () => applyThemePref(readThemePref());

        apply();

        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) apply();
        };

        const onCustom = () => apply();

        window.addEventListener('storage', onStorage);
        window.addEventListener('mp_user_settings_updated', onCustom as EventListener);

        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('mp_user_settings_updated', onCustom as EventListener);
        };
    }, []);

    return null;
}
