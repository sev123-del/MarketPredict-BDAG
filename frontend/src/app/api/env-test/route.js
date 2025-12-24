import { NextResponse } from 'next/server';

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    BDAG_RPC: process.env.BDAG_RPC ? '✅ Loaded (hidden)' : '❌ Missing',
    DEV_FALLBACK_RPC: process.env.DEV_FALLBACK_RPC ? '✅ Present (dev)' : '❌ Missing',
    NEXT_PUBLIC_READ_RPC: process.env.NEXT_PUBLIC_READ_RPC ? '✅ Present (public)' : '❌ Missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "✅ Loaded (hidden)" : "❌ Missing",
  });
}
