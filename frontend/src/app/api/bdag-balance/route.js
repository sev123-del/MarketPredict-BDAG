import { ethers } from 'ethers';

// Safely stringify objects that may contain BigInt values
function safeStringify(obj) {
    return JSON.stringify(obj, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
}

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const address = url.searchParams.get('address');
        const headers = new Headers();
        headers.set('Content-Type', 'application/json; charset=utf-8');

        if (!address) {
            return new Response(safeStringify({ error: 'Missing address' }), { status: 400, headers });
        }
        // Validate Ethereum/BDAG address format
        if (!ethers.isAddress(address)) {
            return new Response(safeStringify({ error: 'Invalid address' }), { status: 400, headers });
        }

        const isDev = process.env.NODE_ENV !== 'production';
        const rpc = process.env.BDAG_RPC || (isDev ? process.env.DEV_FALLBACK_RPC || '' : '');

        // Rate limit requests early
        try {
            const { checkRateLimit } = await import('../../../lib/rateLimit');
            const rl = await checkRateLimit(req);
            if (rl) return rl;
        } catch {
            // ignore rate limiter failures
        }
        if (!rpc) {
            if (!isDev) {
                const headersErr = new Headers();
                headersErr.set('Content-Type', 'application/json; charset=utf-8');
                return new Response(safeStringify({ error: 'BDAG RPC not configured' }), { status: 502, headers: headersErr });
            }
            return new Response(safeStringify({ error: 'BDAG RPC not configured' }), { status: 404, headers });
        }

        const provider = new ethers.JsonRpcProvider(rpc);
        const balance = await provider.getBalance(address);

        return new Response(safeStringify({ balance: balance.toString() }), { status: 200, headers });
    } catch (err) {
        const headers = new Headers();
        headers.set('Content-Type', 'application/json; charset=utf-8');
        return new Response(safeStringify({ error: String(err) }), { status: 500, headers });
    }
}
