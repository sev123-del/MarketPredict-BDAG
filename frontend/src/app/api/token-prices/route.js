import fetch from 'node-fetch';

function safeStringify(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

// Simple in-memory cache & rate limiter for serverless instance lifetime
const cache = new Map(); // key -> { ts, ttl, data }
const RATE_LIMIT = new Map(); // ip -> { count, windowStart }
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 60;

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
    const contracts = url.searchParams.get('contracts'); // comma-separated
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');

    if (!contracts) return new Response(safeStringify({ error: 'Missing contracts' }), { status: 400, headers });

    const key = `prices:${contracts}`;
    const cached = cache.get(key);
    const TTL = 60 * 1000; // 60s
    if (cached && (Date.now() - cached.ts) < TTL) {
      return new Response(safeStringify(cached.data), { status: 200, headers });
    }

    // CoinGecko token price by contract (ethereum)
    const endpoint = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${encodeURIComponent(contracts)}&vs_currencies=usd`;
    const r = await fetch(endpoint);
    if (!r.ok) return new Response(safeStringify({ error: `CoinGecko responded ${r.status}` }), { status: 502, headers });
    const j = await r.json();

    cache.set(key, { ts: Date.now(), ttl: TTL, data: j });
    return new Response(safeStringify(j), { status: 200, headers });
  } catch (err) {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(safeStringify({ error: String(err) }), { status: 500, headers });
  }
}
