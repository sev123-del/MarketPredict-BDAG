import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../../configs/contractConfig';

// cache per-market for short TTL
const marketCache = new Map();
const DEFAULT_TTL = 15 * 1000;

export async function GET(req, { params }) {
    try {
        const id = Number(params.id);
        const rpc = process.env.BDAG_RPC || process.env.NEXT_PUBLIC_BDAG_RPC || process.env.DEV_FALLBACK_RPC || '';
        if (!rpc) {
            console.warn(`market:${id} - no RPC configured`);
            return new Response(JSON.stringify({ error: 'RPC not configured' }), { status: 404 });
        }

        const now = Date.now();
        const cached = marketCache.get(id);
        if (cached && (now - cached.ts) <= cached.ttl) {
            const headers = new Headers();
            headers.set('Cache-Control', `public, max-age=${Math.floor(cached.ttl / 1000)}`);
            return new Response(JSON.stringify(cached.data), { status: 200, headers });
        }

        const provider = new ethers.JsonRpcProvider(rpc);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        const m = await contract.getMarket(id);
        const basics = await contract.getMarketBasics(id).catch(() => ({}));

        const payload = {
            id,
            question: m.question,
            yesPool: String(m.yesPool ?? '0'),
            noPool: String(m.noPool ?? '0'),
            status: Number(m.status ?? 0),
            outcome: m.outcome ?? false,
            closeTime: String(m.closeTime ?? 0),
            ...basics
        };

        marketCache.set(id, { ts: now, ttl: DEFAULT_TTL, data: payload });

        const headers = new Headers();
        headers.set('Cache-Control', `public, max-age=${Math.floor(DEFAULT_TTL / 1000)}`);

        return new Response(JSON.stringify(payload), { status: 200, headers });
    } catch (err) {
        console.error('API market error', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
}
