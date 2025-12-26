import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    // Avoid exposing infra details in production.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    // Basic rate limiting (even in dev) to avoid accidental flooding.
    try {
      const { checkRateLimit } = await import('../../../lib/rateLimit');
      const rl = await checkRateLimit(req, { limit: 30, windowSeconds: 60 });
      if (rl) return rl;
    } catch {
      // ignore rate limiter failures
    }

    const { get, usingRedis } = await import('../../../lib/redisClient');
    const using = typeof usingRedis === 'function' ? usingRedis() : false;
    // Probe memory/readiness by calling get on a non-existent key (shouldn't throw)
    let ok = false;
    try {
      await get('__cache_probe_nonexistent');
      ok = true;
    } catch {
      ok = false;
    }

    return NextResponse.json({ redisAvailable: using, probeOk: ok }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
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
    return NextResponse.json({ error: 'Internal Server Error', detail }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
