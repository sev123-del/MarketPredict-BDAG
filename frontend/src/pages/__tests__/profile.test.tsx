import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProfilePage from '../profile';
import { vi } from 'vitest';

describe('ProfilePage avatar previews and style buttons', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // mock window.ethereum to avoid provider calls
    (window as any).ethereum = undefined;
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
    expect(previewButtons.length).toBeGreaterThanOrEqual(3);

    // click the second preview (salt index 1)
    fireEvent.click(previewButtons[1]);

    const raw = window.localStorage.getItem('mp_user_settings');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.avatarSaltIndex).toBe(1);
    expect(parsed.avatarSeed).toBeDefined();
  });

  test('clicking style button sets mp_avatar_pref in localStorage', () => {
    render(<ProfilePage />);
    const multiBtn = screen.getByRole('button', { name: /Multi|multi/i });
    fireEvent.click(multiBtn);
    const pref = window.localStorage.getItem('mp_avatar_pref');
    expect(pref).toBe('multi');
  });
});
