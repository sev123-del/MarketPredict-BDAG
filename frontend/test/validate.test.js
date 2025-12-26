import { test, expect } from 'vitest';
import { createRequire } from 'module';

const requireC = createRequire(import.meta.url);
const { paramIntOrResponse, addressOrResponse } = requireC('../src/lib/validate.js');

test('paramIntOrResponse accepts valid ints and rejects invalid', () => {
    const ok = paramIntOrResponse('5', 'page', { min: 1, max: 100 });
    expect(ok.ok).toBe(true);
    expect(ok.value).toBe(5);

    const bad = paramIntOrResponse('x', 'page', { min: 1, max: 100 });
    expect(bad.ok).toBe(false);
    expect(bad.response.status).toBe(400);
});

test('addressOrResponse accepts valid Ethereum addresses and rejects invalid', () => {
    const ok = addressOrResponse('0x0000000000000000000000000000000000000000');
    expect(ok.ok).toBe(true);
    expect(ok.value).toBe('0x0000000000000000000000000000000000000000');

    const bad = addressOrResponse('not-an-address');
    expect(bad.ok).toBe(false);
    expect(bad.response.status).toBe(400);
});
