import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../configs/contractConfig';

// Simple in-memory cache for serverless instance lifetime
let marketsCache = { ts: 0, ttl: 15 * 1000, data: null };

export async function GET(req) {
    try {
        const rpc = process.env.BDAG_RPC || process.env.NEXT_PUBLIC_BDAG_RPC || process.env.DEV_FALLBACK_RPC || '';
        if (!rpc) {
            console.warn('markets: no RPC configured; returning empty page for resilience');
            const headers = new Headers();
            headers.set('Cache-Control', `public, max-age=5`);
            return new Response(JSON.stringify({ markets: [], total: 0 }), { status: 200, headers });
        }

        // pagination params
        const url = new URL(req.url);
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

        const now = Date.now();
        let fullList = marketsCache.data;
        if (!fullList || (now - marketsCache.ts) > marketsCache.ttl) {
            const provider = new ethers.JsonRpcProvider(rpc);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

            const countBn = await contract.marketCount();
            const count = Number(countBn || 0);
            fullList = [];
            for (let i = 0; i < count; i++) {
                try {
                    const m = await contract.getMarket(i);
                    const basics = await contract.getMarketBasics(i).catch(() => ({}));
                    fullList.push({
                        id: i,
                        question: m.question,
                        yesPool: String(m.yesPool ?? '0'),
                        noPool: String(m.noPool ?? '0'),
                        status: Number(m.status ?? 0),
                        closeTime: String(m.closeTime ?? 0),
                        ...basics
                    });
                } catch (e) {
                    // skip unavailable
                }
            }

            marketsCache = { ts: now, ttl: marketsCache.ttl, data: fullList };
        }

        const total = fullList.length;
        const start = (page - 1) * limit;
        const slice = fullList.slice(start, start + limit);

        const headers = new Headers();
        headers.set('Cache-Control', `public, max-age=${Math.floor(marketsCache.ttl / 1000)}`);

        return new Response(JSON.stringify({ markets: slice, total }), { status: 200, headers });
    } catch (err) {
        console.error('API markets error', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
}
