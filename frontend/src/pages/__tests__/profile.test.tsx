import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProfilePage from '../profile';
import { vi } from 'vitest';

describe('ProfilePage avatar previews and style buttons', () => {
    beforeEach(() => {
        window.localStorage.clear();
        // mock window.ethereum to simulate a connected account for profile rendering
        (window as any).ethereum = {
            request: vi.fn().mockResolvedValue(['0xabcdefabcdef'])
        };
        (global as any).fetch = vi.fn() as any;
    });

    test('clicking a preview sets avatarSeed and avatarSaltIndex in mp_user_settings', () => {
        const { container } = render(<ProfilePage />);

        // find the Avatar section
        const avatarLabel = screen.getByText('Avatar');
        const avatarSection = avatarLabel.closest('div')!;

        // find preview buttons inside that section: buttons containing an <svg>
        const buttons = Array.from(avatarSection.querySelectorAll('button')) as HTMLButtonElement[];
        const previewButtons = buttons.filter(b => b.querySelector('svg'));
        // 3 types × 9 salts = 27 previews
        expect(previewButtons.length).toBe(27);

        // click the second preview (salt index 1) in the first column
        fireEvent.click(previewButtons[1]);

        const raw = window.localStorage.getItem('mp_user_settings');
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw as string);
        expect(parsed.avatarSaltIndex).toBe(1);
        expect(parsed.avatarSeed).toBeDefined();
    });

    test('clicking style button sets mp_avatar_pref in localStorage', () => {
        render(<ProfilePage />);
        const multiLabel = screen.getByText('Multi');
        const multiCol = multiLabel.parentElement!;
        const multiButtons = Array.from(multiCol.querySelectorAll('button')) as HTMLButtonElement[];
        expect(multiButtons.length).toBe(9);
        fireEvent.click(multiButtons[0]);
        const pref = window.localStorage.getItem('mp_avatar_pref');
        expect(pref).toBe('multi');
    });
});
