import React from 'react';
import { render, screen } from '@testing-library/react';
import Avatar from '../Avatar';

describe('Avatar localStorage preference', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('reads mp_avatar_pref and renders correct variant (boring)', () => {
        window.localStorage.setItem('mp_avatar_pref', 'boring');
        render(<Avatar seed="pref-seed" size={48} displayName="Pref" />);
        const img = screen.getByRole('img', { name: /boring-avatar/i });
        expect(img).toBeInTheDocument();
    });

    test('defaults to auto when no pref set', () => {
        render(<Avatar seed="auto-seed" size={48} displayName="Auto" />);
        // auto chooses jazzicon or boring; just assert an svg role exists
        const svg = screen.getByRole('img');
        expect(svg).toBeInTheDocument();
    });
});
