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

    // Parse with a strict byte cap even if Content-Length is missing.
    let body: any = {};
    try {
      const raw = await req.text();
      const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(raw).length : raw.length;
      if (bytes > 20_000) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
      }
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const text = typeof body?.text === 'string' ? body.text : '';
    const trimmed = text.trim();
    if (!trimmed) return NextResponse.json({ error: "No text provided" }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    // Bound user input to prevent abuse and excessive parsing work.
    if (trimmed.length > 2000) return NextResponse.json({ error: "Text too long" }, { status: 413, headers: { 'Cache-Control': 'no-store' } });

    const result = parseQuestion(trimmed);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ normalized: result.normalized }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const isDev = process.env.NODE_ENV !== 'production';
    let detail: string | undefined;
    if (isDev) {
      try {
        const { redactLikelySecrets, redactUrlCredentials } = await import('../../lib/redact');
        const raw = String((err as any)?.message || err);
        detail = redactLikelySecrets(redactUrlCredentials(raw));
      } catch {
        detail = String((err as any)?.message || err);
      }
    }

    // Avoid logging raw errors (they can contain sensitive URLs/tokens).
    try {
      const { recordSecurityEvent } = await import('../../lib/securityTelemetry');
      recordSecurityEvent('api_error', { route: 'POST:/api', kind: 'parse' });
    } catch {
      // ignore telemetry failures
    }

    if (isDev) {
      console.warn('parse route error (dev, redacted):', detail);
    }

    return NextResponse.json({ error: 'Internal error', detail }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
