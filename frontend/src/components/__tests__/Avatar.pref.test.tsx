import React from 'react';
import { render, screen } from '@testing-library/react';
import Avatar from '../Avatar';
import { vi } from 'vitest';

const mockMulti = vi.fn((_seed: string) => `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`);
vi.mock('@multiavatar/multiavatar/esm', () => ({ default: mockMulti }));

describe('Avatar localStorage preference', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('falls back to multi when mp_avatar_pref is invalid', async () => {
        window.localStorage.setItem('mp_avatar_pref', 'boring');
        render(<Avatar seed="pref-seed" size={48} displayName="Pref" />);
        const img = await screen.findByRole('img', { name: /avatar pref/i });
        expect(img).toBeInTheDocument();
    });

    test('defaults to multi when no pref set', async () => {
        render(<Avatar seed="auto-seed" size={48} displayName="Auto" />);
        const img = await screen.findByRole('img', { name: /avatar auto/i });
        expect(img).toBeInTheDocument();
    });
});
