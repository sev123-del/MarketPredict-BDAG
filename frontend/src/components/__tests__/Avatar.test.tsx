import React from 'react';
import { render, screen } from '@testing-library/react';
import Avatar from '../Avatar';
import { vi } from 'vitest';

// Mock the multiavatar dynamic import used by Avatar and capture calls
const mockMulti = vi.fn((seed: string) => `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`);
vi.mock('@multiavatar/multiavatar/esm', () => ({ default: mockMulti }));

describe('Avatar component', () => {
    test('renders initials in SVG avatar when variant=auto', () => {
        render(<Avatar seed="carol" variant="auto" size={48} displayName="Carol" />);
        expect(screen.getByText(/CA/)).toBeInTheDocument();
    });

    test('renders sanitized multiavatar img when variant=multi', async () => {
        render(<Avatar seed="dan" variant="multi" size={48} displayName="Dan" saltIndex={0} />);
        // findByRole waits for the async dynamic import + sanitization
        const img = await screen.findByRole('img', { name: /avatar dan/i });
        expect(img).toBeInTheDocument();
        // ensure it is an <img> element
        expect(img.tagName.toLowerCase()).toBe('img');
        // assert multiavatar was called with salted seed
        expect(mockMulti).toHaveBeenCalledWith('dan:0');
    });
});
