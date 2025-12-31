import { ethers } from 'ethers';

function jsonHeaders() {
    const h = new Headers();
    h.set('Content-Type', 'application/json; charset=utf-8');
    return h;
}

export function paramIntOrResponse(raw, name, opts = {}) {
    const min = typeof opts.min === 'number' ? opts.min : Number.MIN_SAFE_INTEGER;
    const max = typeof opts.max === 'number' ? opts.max : Number.MAX_SAFE_INTEGER;
    const fallback = typeof opts.fallback === 'number' ? opts.fallback : undefined;
    if ((raw === null || raw === undefined || raw === '') && typeof fallback === 'number') {
        return { ok: true, value: fallback };
    }
    const n = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isInteger(n) || n < min || n > max) {
        const headers = jsonHeaders();
        return { ok: false, response: new Response(JSON.stringify({ error: `Invalid ${name}` }), { status: 400, headers }) };
    }
    return { ok: true, value: n };
}

export function addressOrResponse(addr) {
    if (!addr || typeof addr !== 'string') {
        const headers = jsonHeaders();
        return { ok: false, response: new Response(JSON.stringify({ error: 'Missing address' }), { status: 400, headers }) };
    }
    try {
        if (!ethers.isAddress(addr)) {
            const headers = jsonHeaders();
            return { ok: false, response: new Response(JSON.stringify({ error: 'Invalid address' }), { status: 400, headers }) };
        }
    } catch {
        const headers = jsonHeaders();
        return { ok: false, response: new Response(JSON.stringify({ error: 'Invalid address' }), { status: 400, headers }) };
    }
    return { ok: true, value: addr.toLowerCase() };
}

const validate = { paramIntOrResponse, addressOrResponse };
export default validate;
