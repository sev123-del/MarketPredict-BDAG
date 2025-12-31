import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../configs/contractConfig';
import { addDraft, approveDraft, listDrafts, rejectDraft } from '../../../lib/draftsStore';

function safeJson(obj) {
    return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function jsonResponse(body, status = 200, cache = 'no-store') {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', cache);
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

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const status = url.searchParams.get('status') || 'pending';
        const drafts = await listDrafts(status);
        return jsonResponse({ drafts }, 200, 'no-store');
    } catch (err) {
        return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
}

export async function POST(req) {
    // Bot ingestion: requires token
    try {
        const token = req.headers.get('x-draft-bot-token') || '';
        const expected = process.env.DRAFT_BOT_TOKEN || '';
        if (!expected || token !== expected) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        const body = await req.json().catch(() => ({}));
        const res = await addDraft(body);
        if (!res.ok) return jsonResponse({ error: res.error }, 400);
        return jsonResponse({ draft: res.value }, 201);
    } catch {
        return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
}

export async function PATCH(req) {
    // Human approval/reject: signed + must be owner or on-chain writer
    try {
        const body = await req.json().catch(() => ({}));

        const action = String(body?.action || '');
        if (action !== 'approve' && action !== 'reject') {
            return jsonResponse({ error: 'Invalid action' }, 400);
        }

        const address = String(body?.address || '');
        const signature = String(body?.signature || '');
        const id = Number(body?.id);
        const issuedAt = String(body?.issuedAt || '');

        const ver = await verifySignedAction({ address, signature, action, id, issuedAt });
        if (!ver.ok) return jsonResponse({ error: ver.error }, 401);

        const auth = await isAuthorizedWriter(req, address);
        if (auth instanceof Response) return auth;
        if (!auth) return jsonResponse({ error: 'Not authorized' }, 403);

        const r = action === 'approve' ? await approveDraft(id, address.toLowerCase()) : await rejectDraft(id, address.toLowerCase());
        if (!r.ok) return jsonResponse({ error: r.error }, 404);

        return jsonResponse({ draft: r.value }, 200);
    } catch {
        return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
}
