import fetch from 'node-fetch';

function safeStringify(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

// Simple in-memory cache
const cache = new Map();

export async function GET(req) {
  try {
    // Centralized rate-limiter (supports Redis if available)
    try {
      const { checkRateLimit } = await import('../../../lib/rateLimit');
      const rl = await checkRateLimit(req, { limit: 30, windowSeconds: 60 });
      if (rl) return rl;
    } catch {
      // ignore rate limiter failures and fall back to ad-hoc behavior below
    }

    const url = new URL(req.url);
    const address = url.searchParams.get('address');
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');

    if (!address) return new Response(safeStringify({ error: 'Missing address' }), { status: 400, headers });

    const key = `portfolio:${address}`;
    const cached = cache.get(key);
    const TTL = 120 * 1000; // 2 minutes
    if (cached && (Date.now() - cached.ts) < TTL) {
      return new Response(safeStringify(cached.data), { status: 200, headers });
    }

    const apiKey = process.env.ALCHEMY_API_KEY || '';
    if (!apiKey) {
      return new Response(safeStringify({ error: 'ALCHEMY_API_KEY not configured on server' }), { status: 404, headers });
    }

    // Use Alchemy token balances endpoint for mainnet (simple proxy)
    const endpoint = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}/getTokenBalances?address=${address}`;
    const r = await fetch(endpoint);
    if (!r.ok) return new Response(safeStringify({ error: `Alchemy responded ${r.status}` }), { status: 502, headers });
    const j = await r.json();

    const ok = {
      address,
      tokenBalances: j.tokenBalances || null,
    };

    cache.set(key, { ts: Date.now(), ttl: TTL, data: ok });
    return new Response(safeStringify(ok), { status: 200, headers });
  } catch (err) {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(safeStringify({ error: String(err) }), { status: 500, headers });
  }
}
