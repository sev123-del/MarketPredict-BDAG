import { NextResponse } from 'next/server';

export async function GET(req) {
  // Defense-in-depth: require explicit opt-in even in development.
  const enabled = process.env.ENABLE_ENV_TEST === 'true';
  if (process.env.NODE_ENV !== 'development' || !enabled) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  // Rate limit even in dev to avoid accidental sharing/abuse.
  try {
    const { checkRateLimit } = await import('../../../lib/rateLimit');
    const rl = await checkRateLimit(req, { limit: 10, windowSeconds: 60 });
    if (rl) return rl;
  } catch {
    // ignore rate limiter failures
  }

  const res = NextResponse.json({
    BDAG_RPC: process.env.BDAG_RPC ? '✅ Loaded (hidden)' : '❌ Missing',
    DEV_FALLBACK_RPC: process.env.DEV_FALLBACK_RPC ? '✅ Present (dev)' : '❌ Missing',
    NEXT_PUBLIC_READ_RPC: process.env.NEXT_PUBLIC_READ_RPC ? '✅ Present (public)' : '❌ Missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "✅ Loaded (hidden)" : "❌ Missing",
  });

  res.headers.set('Cache-Control', 'no-store');
  return res;
}
