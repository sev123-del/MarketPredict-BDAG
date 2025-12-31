// Minimal drafts store with Redis-first persistence and in-memory fallback.
// Purpose: support bot-suggested market drafts + fast human approval.

const MEM = {
    nextId: 1,
    // id -> draft
    drafts: new Map(),
};

function nowIso() {
    return new Date().toISOString();
}

function normalizeDraftInput(body) {
    const question = String(body?.question ?? '').trim();
    const description = String(body?.description ?? '').trim();
    const category = String(body?.category ?? 'General').trim() || 'General';
    const closeTimeIso = String(body?.closeTimeIso ?? '').trim();
    const marketType = String(body?.marketType ?? 'manual').trim();
    const priceFeed = String(body?.priceFeed ?? '').trim();
    const targetPrice = String(body?.targetPrice ?? '').trim();

    if (!question || question.length < 10 || question.length > 500) {
        return { ok: false, error: 'Invalid question' };
    }
    if (description.length > 5000) {
        return { ok: false, error: 'Description too long' };
    }
    if (!closeTimeIso) {
        return { ok: false, error: 'Missing closeTimeIso' };
    }
    const closeMs = Date.parse(closeTimeIso);
    if (!Number.isFinite(closeMs) || closeMs <= Date.now()) {
        return { ok: false, error: 'Invalid closeTimeIso' };
    }

    const mt = marketType === 'oracle' ? 'oracle' : 'manual';
    const out = {
        question,
        description,
        category,
        closeTimeIso: new Date(closeMs).toISOString(),
        marketType: mt,
        priceFeed: mt === 'oracle' ? (priceFeed || '') : '',
        targetPrice: mt === 'oracle' ? (targetPrice || '') : '',
    };

    return { ok: true, value: out };
}

async function tryRedis() {
    try {
        const redis = await import('./redisClient');
        return redis;
    } catch {
        return null;
    }
}

function draftToJson(d) {
    return {
        id: d.id,
        status: d.status,
        question: d.question,
        description: d.description,
        category: d.category,
        closeTimeIso: d.closeTimeIso,
        marketType: d.marketType,
        priceFeed: d.priceFeed,
        targetPrice: d.targetPrice,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        approvedBy: d.approvedBy || null,
        rejectedBy: d.rejectedBy || null,
    };
}

export async function listDrafts(status = 'pending') {
    const redis = await tryRedis();
    if (redis) {
        const raw = await redis.get('drafts:v1');
        const parsed = raw ? JSON.parse(raw) : { nextId: 1, drafts: [] };
        const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
        const filtered = status === 'all' ? drafts : drafts.filter((d) => d.status === status);
        return filtered;
    }

    const all = Array.from(MEM.drafts.values()).map(draftToJson);
    return status === 'all' ? all : all.filter((d) => d.status === status);
}

export async function addDraft(body) {
    const norm = normalizeDraftInput(body);
    if (!norm.ok) return norm;

    const redis = await tryRedis();
    const createdAt = nowIso();

    if (redis) {
        const raw = await redis.get('drafts:v1');
        const parsed = raw ? JSON.parse(raw) : { nextId: 1, drafts: [] };
        const id = Number(parsed.nextId || 1);
        const draft = {
            id,
            status: 'pending',
            ...norm.value,
            createdAt,
            updatedAt: createdAt,
            approvedBy: null,
            rejectedBy: null,
        };
        parsed.nextId = id + 1;
        parsed.drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
        parsed.drafts.unshift(draft);
        await redis.set('drafts:v1', JSON.stringify(parsed));
        return { ok: true, value: draftToJson(draft) };
    }

    const id = MEM.nextId++;
    const draft = {
        id,
        status: 'pending',
        ...norm.value,
        createdAt,
        updatedAt: createdAt,
        approvedBy: null,
        rejectedBy: null,
    };
    MEM.drafts.set(id, draft);
    return { ok: true, value: draftToJson(draft) };
}

async function updateDraftStatus(id, status, actorAddress) {
    const redis = await tryRedis();
    const updatedAt = nowIso();

    if (redis) {
        const raw = await redis.get('drafts:v1');
        const parsed = raw ? JSON.parse(raw) : { nextId: 1, drafts: [] };
        const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
        const idx = drafts.findIndex((d) => Number(d.id) === Number(id));
        if (idx < 0) return { ok: false, error: 'Draft not found' };
        const d = drafts[idx];
        d.status = status;
        d.updatedAt = updatedAt;
        if (status === 'approved') d.approvedBy = actorAddress;
        if (status === 'rejected') d.rejectedBy = actorAddress;
        await redis.set('drafts:v1', JSON.stringify(parsed));
        return { ok: true, value: draftToJson(d) };
    }

    const d = MEM.drafts.get(Number(id));
    if (!d) return { ok: false, error: 'Draft not found' };
    d.status = status;
    d.updatedAt = updatedAt;
    if (status === 'approved') d.approvedBy = actorAddress;
    if (status === 'rejected') d.rejectedBy = actorAddress;
    MEM.drafts.set(Number(id), d);
    return { ok: true, value: draftToJson(d) };
}

export async function approveDraft(id, actorAddress) {
    return updateDraftStatus(id, 'approved', actorAddress);
}

export async function rejectDraft(id, actorAddress) {
    return updateDraftStatus(id, 'rejected', actorAddress);
}
