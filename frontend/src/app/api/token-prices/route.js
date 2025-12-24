import fetch from 'node-fetch';

function safeStringify(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

// Simple in-memory cache for serverless instance lifetime
const cache = new Map(); // key -> { ts, ttl, data }

export async function GET(req) {
  try {
    // Centralized rate-limiter (supports Redis if available)
    try {
      const { checkRateLimit } = await import('../../../lib/rateLimit');
      const rl = await checkRateLimit(req, { limit: 60, windowSeconds: 60 });
      if (rl) return rl;
    } catch {
      // ignore rate limiter failures and fall back to ad-hoc behavior below
    }

    const url = new URL(req.url);
    const contracts = url.searchParams.get('contracts'); // comma-separated
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');

    // Normalize and validate the contracts list. If empty after filtering,
    // return an empty successful response to avoid returning a 400 to clients
    // that simply asked for prices but had no valid addresses.
    const list = contracts ? contracts.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (list.length === 0) {
      return new Response(safeStringify({}), { status: 200, headers });
    }

    const cleanContracts = list.join(',');
    const key = `prices:${cleanContracts}`;
    const cached = cache.get(key);
    const TTL = 60 * 1000; // 60s
    if (cached && (Date.now() - cached.ts) < TTL) {
      return new Response(safeStringify(cached.data), { status: 200, headers });
    }

    // CoinGecko token price by contract (ethereum)
    const endpoint = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${encodeURIComponent(cleanContracts)}&vs_currencies=usd`;
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
