import { fetchWithTimeout } from '../../../lib/fetchServer';

function safeStringify(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

// Simple in-memory cache for serverless instance lifetime
const cache = new Map(); // key -> { ts, ttl, data }

const MAX_CACHE_ENTRIES = 400;

function pruneCache(ttlMs) {
  try {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (!v || typeof v.ts !== 'number' || (now - v.ts) > ttlMs) {
        cache.delete(k);
      }
    }
    // Map preserves insertion order; drop oldest entries first.
    while (cache.size > MAX_CACHE_ENTRIES) {
      const firstKey = cache.keys().next().value;
      if (firstKey === undefined) break;
      cache.delete(firstKey);
    }
  } catch {
    // ignore cache prune failures
  }
}

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
    headers.set('Cache-Control', 'no-store');

    // Normalize and validate the contracts list. If empty after filtering,
    // return an empty successful response to avoid returning a 400 to clients
    // that simply asked for prices but had no valid addresses.
    const listRaw = contracts ? contracts.split(',').map(s => s.trim()).filter(Boolean) : [];
    const isHexAddress = (s) => /^0x[a-fA-F0-9]{40}$/.test(s);
    // Bound list size defensively to avoid oversized upstream requests.
    const list = listRaw.filter(isHexAddress).slice(0, 50);
    if (list.length === 0) {
      return new Response(safeStringify({}), { status: 200, headers });
    }

    const cleanContracts = list.join(',');
    const key = `prices:${cleanContracts}`;
    const cached = cache.get(key);
    const TTL = 60 * 1000; // 60s
    pruneCache(TTL);
    if (cached && (Date.now() - cached.ts) < TTL) {
      return new Response(safeStringify(cached.data), { status: 200, headers });
    }

    // CoinGecko token price by contract (ethereum)
    const endpoint = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${encodeURIComponent(cleanContracts)}&vs_currencies=usd`;
    const r = await fetchWithTimeout(endpoint, { method: 'GET' }, 8000);
    if (!r.ok) return new Response(safeStringify({ error: `CoinGecko responded ${r.status}` }), { status: 502, headers });
    const j = await r.json();

    cache.set(key, { ts: Date.now(), ttl: TTL, data: j });
    return new Response(safeStringify(j), { status: 200, headers });
  } catch (err) {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    const isDev = process.env.NODE_ENV !== 'production';
    let detail;
    if (isDev) {
      try {
        const { redactLikelySecrets } = await import('../../../lib/redact');
        detail = redactLikelySecrets(String(err?.message || err));
      } catch {
        detail = String(err?.message || err);
      }
    }
    return new Response(safeStringify({ error: 'Internal Server Error', detail }), { status: 500, headers });
  }
}
