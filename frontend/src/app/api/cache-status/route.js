import { NextResponse } from 'next/server';

export async function GET() {
  try {
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

    return NextResponse.json({ redisAvailable: using, probeOk: ok });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
