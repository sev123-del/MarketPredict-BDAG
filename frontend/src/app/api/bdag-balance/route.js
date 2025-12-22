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

        const rpc = process.env.BDAG_RPC || process.env.DEV_FALLBACK_RPC || '';
        if (!rpc) {
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
