// Simplified parse route — OpenAI removed.
import { NextResponse } from "next/server";
import { parseQuestion } from "../../utils/aiQuestionParser";

export async function POST(req: Request) {
  try {
    // Same-origin guard (prevents cross-site POST abuse in browsers).
    try {
      const { enforceSameOrigin } = await import('../../lib/originGuard');
      const blocked = enforceSameOrigin(req);
      if (blocked) return blocked;
    } catch {
      // ignore origin guard failures
    }

    // Basic rate limiting (cheap endpoint, but still user-input driven).
    try {
      const { checkRateLimit } = await import('../../lib/rateLimit');
      const rl = await checkRateLimit(req as unknown as Request, { limit: 30, windowSeconds: 60 });
      if (rl) return rl;
    } catch {
      // ignore rate limiter failures
    }

    const contentType = req.headers.get('content-type') || '';
    const contentLength = Number(req.headers.get('content-length') || '0');
    // Require JSON; keep parsing simple and reduce weird payload attacks.
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415, headers: { 'Cache-Control': 'no-store' } });
    }
    // Bound payload size defensively (this endpoint should be tiny).
    if (Number.isFinite(contentLength) && contentLength > 20_000) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text : '';
    const trimmed = text.trim();
    if (!trimmed) return NextResponse.json({ error: "No text provided" }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    // Bound user input to prevent abuse and excessive parsing work.
    if (trimmed.length > 2000) return NextResponse.json({ error: "Text too long" }, { status: 413, headers: { 'Cache-Control': 'no-store' } });

    const result = parseQuestion(trimmed);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ normalized: result.normalized }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error("parse route error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
