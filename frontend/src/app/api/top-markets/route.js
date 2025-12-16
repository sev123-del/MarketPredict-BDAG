import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../configs/contractConfig';

// cache top markets
let topMarketsCache = { ts: 0, ttl: 10 * 1000, data: null };

export async function GET() {
    try {
        const rpc = process.env.BDAG_RPC || process.env.NEXT_PUBLIC_BDAG_RPC || process.env.DEV_FALLBACK_RPC || '';
        if (!rpc) {
            console.warn('top-markets: no RPC configured; returning empty list for resilience');
            const headers = new Headers();
            headers.set('Cache-Control', `public, max-age=5`);
            return new Response(JSON.stringify({ markets: [] }), { status: 200, headers });
        }

        const now = Date.now();
        if (topMarketsCache.data && (now - topMarketsCache.ts) <= topMarketsCache.ttl) {
            return new Response(JSON.stringify({ markets: topMarketsCache.data }), { status: 200 });
        }

        const provider = new ethers.JsonRpcProvider(rpc);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        const countBn = await contract.marketCount();
        const count = Number(countBn || 0);
        const markets = [];
        for (let i = 0; i < count; i++) {
            try {
                const m = await contract.getMarket(i);
                const yesPool = Number(ethers.formatEther(m.yesPool || 0));
                const noPool = Number(ethers.formatEther(m.noPool || 0));
                const totalPool = yesPool + noPool;
                const status = Number(m.status || 0);
                if (status === 0 && totalPool > 0) {
                    markets.push({
                        id: i,
                        question: m.question,
                        yesPool: String(m.yesPool || '0'),
                        noPool: String(m.noPool || '0'),
                        status,
                        closeTime: String(m.closeTime || 0)
                    });
                }
            } catch (e) {
                // ignore
            }
        }

        markets.sort((a, b) => Number(b.yesPool) + Number(b.noPool) - (Number(a.yesPool) + Number(a.noPool)));
        const top = markets.slice(0, 3);
        topMarketsCache = { ts: now, ttl: topMarketsCache.ttl, data: top };

        const headers = new Headers();
        headers.set('Cache-Control', `public, max-age=${Math.floor(topMarketsCache.ttl / 1000)}`);

        return new Response(JSON.stringify({ markets: top }), { status: 200, headers });
    } catch (err) {
        console.error('API top-markets error', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
}
