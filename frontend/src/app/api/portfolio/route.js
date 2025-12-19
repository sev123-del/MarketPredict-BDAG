import fetch from 'node-fetch';

function safeStringify(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

// Simple in-memory cache & rate limiter
const cache = new Map();
const RATE_LIMIT = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;

function getIp(req) {
  return (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local').split(',')[0].trim();
}

export async function GET(req) {
  try {
    const ip = getIp(req);
    const rl = RATE_LIMIT.get(ip) || { count: 0, windowStart: Date.now() };
    if (Date.now() - rl.windowStart > WINDOW_MS) {
      rl.count = 0; rl.windowStart = Date.now();
    }
    rl.count += 1;
    RATE_LIMIT.set(ip, rl);
    if (rl.count > MAX_PER_WINDOW) {
      const headers = new Headers(); headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(safeStringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
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
