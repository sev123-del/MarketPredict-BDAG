import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../configs/contractConfig';
import { addDraft, approveDraft, listDrafts, rejectDraft } from '../../../lib/draftsStore';

// In-memory nonce store (fallback when Redis is unavailable)
const nonceStore = new Map();
function cleanupNonceStore() {
    const now = Date.now();
    for (const [k, v] of nonceStore.entries()) {
        if (!v || typeof v.expiresAt !== 'number' || v.expiresAt <= now) nonceStore.delete(k);
    }
}
function isAddressLike(addr) {
    const a = String(addr || '').toLowerCase();
    return a.startsWith('0x') && a.length === 42;
}
async function generateNonce() {
    // 16 random bytes -> hex
    try {
        const rand = new Uint8Array(16);
        const cryptoObj = globalThis.crypto || globalThis.webcrypto;
        if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
            cryptoObj.getRandomValues(rand);
            return Array.from(rand).map((b) => b.toString(16).padStart(2, '0')).join('');
        }
    } catch {
        // fall through
    }

    // Node.js fallback (should be available for this route in the Node runtime).
    try {
        const { randomBytes } = await import('node:crypto');
        return randomBytes(16).toString('hex');
    } catch {
        // very small last-resort fallback if crypto isn't available
        return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    }
}
function nonceKey(address, nonce) {
    return `draftsig:${String(address || '').toLowerCase()}:${String(nonce || '')}`;
}
async function storeNonceOnce(address, nonce, ttlSeconds) {
    const key = nonceKey(address, nonce);
    cleanupNonceStore();

    try {
        const redisMod = await import('../../../lib/redisClient').catch(() => null);
        if (redisMod && redisMod.default) {
            const redis = redisMod.default;
            // set NX so a nonce can't be overwritten (defense-in-depth)
            await redis.set(key, '1', { EX: ttlSeconds, NX: true });
            return;
        }
    } catch {
        // fall back
    }

    nonceStore.set(key, { expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function consumeNonceOnce(address, nonce) {
    const key = nonceKey(address, nonce);
    cleanupNonceStore();

    try {
        const redisMod = await import('../../../lib/redisClient').catch(() => null);
        if (redisMod && redisMod.default) {
            const redis = redisMod.default;
            const deleted = await redis.del(key);
            return Number(deleted) > 0;
        }
    } catch {
        // fall back
    }

    if (!nonceStore.has(key)) return false;
    nonceStore.delete(key);
    return true;
}

function baseJsonHeaders(cache = 'no-store') {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', cache);
    return headers;
}

async function enforceGuards(req, opts = {}) {
    // Same-origin guard (prevents cross-site POST abuse in browsers).
    // If Origin is missing, allow (server-to-server / non-browser).
    try {
        const { enforceSameOrigin } = await import('../../../lib/originGuard');
        const blocked = enforceSameOrigin(req);
        if (blocked) return blocked;
    } catch {
        // ignore origin guard failures
    }

    // Rate limiting
    try {
        const { checkRateLimit } = await import('../../../lib/rateLimit');
        const rl = await checkRateLimit(req, opts.rateLimit || undefined);
        if (rl) return rl;
    } catch {
        // ignore rate limiter failures
    }

    return null;
}

async function readJsonBody(req, { maxBytes }) {
    const headers = baseJsonHeaders('no-store');

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return { ok: false, res: new Response(JSON.stringify({ error: 'Unsupported Media Type' }), { status: 415, headers }) };
    }

    const contentLength = Number(req.headers.get('content-length') || '0');
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        return { ok: false, res: new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers }) };
    }

    // Prefer req.text() so we can enforce a hard bound even if content-length is missing.
    try {
        const text = await req.text();
        const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
        if (bytes > maxBytes) {
            return { ok: false, res: new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers }) };
        }
        const parsed = text ? JSON.parse(text) : {};
        return { ok: true, value: parsed };
    } catch {
        return { ok: false, res: new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers }) };
    }
}

function safeJson(obj) {
    return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function jsonResponse(body, status = 200, cache = 'no-store') {
    const headers = baseJsonHeaders(cache);
    return new Response(safeJson(body), { status, headers });
}

async function isAuthorizedWriter(req, address) {
    const addr = String(address || '').toLowerCase();
    if (!addr || !addr.startsWith('0x') || addr.length !== 42) return false;

    const isDev = process.env.NODE_ENV !== 'production';
    const { selectRpcUrl } = await import('../../../lib/rpcFailover');
    const rpc = await selectRpcUrl({ isDev, requiredContractAddress: CONTRACT_ADDRESS });
    if (!rpc) return false;

    // optional rate limit
    try {
        const { checkRateLimit } = await import('../../../lib/rateLimit');
        const rl = await checkRateLimit(req);
        if (rl) return rl;
    } catch {
        // ignore
    }

    const provider = new ethers.JsonRpcProvider(rpc);
    const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

    try {
        const owner = String(await c.owner()).toLowerCase();
        if (owner === addr) return true;
    } catch {
        // ignore
    }

    // This getter exists only after you redeploy with the new contract.
    // If the ABI doesn't include it yet, this call will throw and we treat as unauthorized.
    try {
        const allowed = await c.marketWriters(addr);
        return Boolean(allowed);
    } catch {
        return false;
    }
}

async function verifySignedAction({ address, signature, action, id, issuedAt }) {
    const addr = String(address || '').toLowerCase();
    const sig = String(signature || '');
    const a = String(action || '');
    const draftId = Number(id);

    if (!addr || !sig || !a || !Number.isFinite(draftId)) {
        return { ok: false, error: 'Missing fields' };
    }

    const issued = Date.parse(String(issuedAt || ''));
    if (!Number.isFinite(issued)) return { ok: false, error: 'Invalid issuedAt' };
    const ageMs = Math.abs(Date.now() - issued);
    if (ageMs > 10 * 60 * 1000) return { ok: false, error: 'Signature expired' };

    const msg = `MarketPredict Draft Action\nAction: ${a}\nDraftId: ${draftId}\nIssuedAt: ${new Date(issued).toISOString()}`;

    try {
        const recovered = ethers.verifyMessage(msg, sig).toLowerCase();
        if (recovered !== addr) return { ok: false, error: 'Bad signature' };
        return { ok: true, message: msg };
    } catch {
        return { ok: false, error: 'Bad signature' };
    }
}

async function verifySignedActionWithNonce({ address, signature, action, id, issuedAt, nonce }) {
    const addr = String(address || '').toLowerCase();
    const sig = String(signature || '');
    const a = String(action || '');
    const draftId = Number(id);
    const n = String(nonce || '');

    if (!addr || !sig || !a || !n || !Number.isFinite(draftId)) {
        return { ok: false, error: 'Missing fields' };
    }

    const issued = Date.parse(String(issuedAt || ''));
    if (!Number.isFinite(issued)) return { ok: false, error: 'Invalid issuedAt' };
    const ageMs = Math.abs(Date.now() - issued);
    if (ageMs > 10 * 60 * 1000) return { ok: false, error: 'Signature expired' };

    const msg = `MarketPredict Draft Action\nAction: ${a}\nDraftId: ${draftId}\nIssuedAt: ${new Date(issued).toISOString()}\nNonce: ${n}`;

    try {
        const recovered = ethers.verifyMessage(msg, sig).toLowerCase();
        if (recovered !== addr) return { ok: false, error: 'Bad signature' };
        return { ok: true, message: msg };
    } catch {
        return { ok: false, error: 'Bad signature' };
    }
}

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const mode = url.searchParams.get('mode') || '';
        if (mode === 'challenge') {
            const blocked = await enforceGuards(req, { rateLimit: { limit: 30, windowSeconds: 60, scope: 'GET:/api/drafts:challenge' } });
            if (blocked) return blocked;

            const address = String(url.searchParams.get('address') || '').toLowerCase();
            if (!isAddressLike(address)) return jsonResponse({ error: 'Invalid address' }, 400);

            const nonce = await generateNonce();
            // 10 minute TTL matches signature expiry window.
            await storeNonceOnce(address, nonce, 10 * 60);
            return jsonResponse({ address, nonce, expiresInSeconds: 10 * 60 }, 200);
        }

        const blocked = await enforceGuards(req, { rateLimit: { limit: 120, windowSeconds: 60, scope: 'GET:/api/drafts' } });
        if (blocked) return blocked;

        const status = url.searchParams.get('status') || 'pending';
        const drafts = await listDrafts(status);
        return jsonResponse({ drafts }, 200, 'no-store');
    } catch (err) {
        let detail;
        if (process.env.NODE_ENV !== 'production') {
            try {
                const { redactLikelySecrets } = await import('../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }
        }
        return jsonResponse({ error: 'Internal Server Error', detail }, 500);
    }
}

export async function POST(req) {
    // Bot ingestion: requires token
    try {
        const blocked = await enforceGuards(req, { rateLimit: { limit: 60, windowSeconds: 60, scope: 'POST:/api/drafts' } });
        if (blocked) return blocked;

        const token = req.headers.get('x-draft-bot-token') || '';
        const expected = process.env.DRAFT_BOT_TOKEN || '';
        if (!expected || token !== expected) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        const parsed = await readJsonBody(req, { maxBytes: 50_000 });
        if (!parsed.ok) return parsed.res;
        const body = parsed.value;

        const res = await addDraft(body);
        if (!res.ok) return jsonResponse({ error: res.error }, 400);
        return jsonResponse({ draft: res.value }, 201);
    } catch (err) {
        let detail;
        if (process.env.NODE_ENV !== 'production') {
            try {
                const { redactLikelySecrets } = await import('../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }
        }
        return jsonResponse({ error: 'Internal Server Error', detail }, 500);
    }
}

export async function PATCH(req) {
    // Human approval/reject: signed + must be owner or on-chain writer
    try {
        const blocked = await enforceGuards(req, { rateLimit: { limit: 30, windowSeconds: 60, scope: 'PATCH:/api/drafts' } });
        if (blocked) return blocked;

        const parsed = await readJsonBody(req, { maxBytes: 20_000 });
        if (!parsed.ok) return parsed.res;
        const body = parsed.value;

        const action = String(body?.action || '');
        if (action !== 'approve' && action !== 'reject') {
            return jsonResponse({ error: 'Invalid action' }, 400);
        }

        const address = String(body?.address || '');
        const signature = String(body?.signature || '');
        const id = Number(body?.id);
        const issuedAt = String(body?.issuedAt || '');
        const nonce = String(body?.nonce || '');

        const ver = await verifySignedActionWithNonce({ address, signature, action, id, issuedAt, nonce });
        if (!ver.ok) return jsonResponse({ error: ver.error }, 401);

        // One-time nonce consumption prevents replay attacks within the TTL window.
        const nonceOk = await consumeNonceOnce(address, nonce);
        if (!nonceOk) return jsonResponse({ error: 'Invalid or reused nonce' }, 401);

        const auth = await isAuthorizedWriter(req, address);
        if (auth instanceof Response) return auth;
        if (!auth) return jsonResponse({ error: 'Not authorized' }, 403);

        const r = action === 'approve' ? await approveDraft(id, address.toLowerCase()) : await rejectDraft(id, address.toLowerCase());
        if (!r.ok) return jsonResponse({ error: r.error }, 404);

        return jsonResponse({ draft: r.value }, 200);
    } catch (err) {
        let detail;
        if (process.env.NODE_ENV !== 'production') {
            try {
                const { redactLikelySecrets } = await import('../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }
        }
        return jsonResponse({ error: 'Internal Server Error', detail }, 500);
    }
}
