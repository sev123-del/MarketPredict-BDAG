import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';

import ProfilePage from '../src/pages/profile';

describe('ProfilePage avatar previews and style buttons', () => {
    beforeEach(() => {
        window.localStorage.clear();
        // mock window.ethereum to simulate a connected account for profile rendering
        (window as any).ethereum = {
            request: vi.fn().mockResolvedValue(['0xabcdefabcdef'])
        };
        (global as any).fetch = vi.fn() as any;
    });

    test('clicking a preview sets avatarSeed and avatarSaltIndex in mp_user_settings', async () => {
        const { container } = render(<ProfilePage />);

        // if profile is gated, click Connect Wallet to initialize
        const connectBtn = screen.queryByRole('button', { name: /connect wallet/i });
        if (connectBtn) fireEvent.click(connectBtn);

        // find the Avatar section
        const avatarLabel = await screen.findByText('Avatar');
        const avatarSection = avatarLabel.closest('div')!;

        // find preview buttons inside that section: buttons containing an <svg>
        const buttons = Array.from(avatarSection.querySelectorAll('button')) as HTMLButtonElement[];
        const previewButtons = buttons.filter(b => b.querySelector('svg'));
        // 1 type (Multi) × 9 salts = 9 previews
        expect(previewButtons.length).toBe(9);

        // click the second preview (salt index 1) in the first column
        fireEvent.click(previewButtons[1]);

        const raw = window.localStorage.getItem('mp_user_settings');
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw as string);
        expect(parsed.avatarSaltIndex).toBe(1);
        expect(parsed.avatarSeed).toBeDefined();
    });

    test('clicking style button sets mp_avatar_pref in localStorage', async () => {
        render(<ProfilePage />);
        const connectBtn = screen.queryByRole('button', { name: /connect wallet/i });
        if (connectBtn) fireEvent.click(connectBtn);

        // Find the Avatar section and click the first avatar selection button.
        // (The visible "Multi" label was removed by design.)
        const avatarLabel = await screen.findByText('Avatar');
        const avatarSection = avatarLabel.closest('div')!;

        const avatarButtons = within(avatarSection).getAllByRole('button', { name: /select .* avatar/i });
        expect(avatarButtons.length).toBe(9);
        fireEvent.click(avatarButtons[0]);
        const pref = window.localStorage.getItem('mp_avatar_pref');
        expect(pref).toBe('multi');
    });
});
