import { ethers } from 'ethers';
import { withTimeout } from '../../../lib/asyncServer';

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
        headers.set('Cache-Control', 'no-store');

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
                headersErr.set('Cache-Control', 'no-store');
                return new Response(safeStringify({ error: 'BDAG RPC not configured' }), { status: 502, headers: headersErr });
            }
            return new Response(safeStringify({ error: 'BDAG RPC not configured' }), { status: 404, headers });
        }

        const provider = new ethers.JsonRpcProvider(rpc);
        const balance = await withTimeout(provider.getBalance(address), 8000, 'RPC getBalance timed out');

        return new Response(safeStringify({ balance: balance.toString() }), { status: 200, headers });
    } catch (err) {
        const headers = new Headers();
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.set('Cache-Control', 'no-store');
        const isDev = process.env.NODE_ENV !== 'production';
        let detail;
        if (isDev) {
            try {
                const { redactLikelySecrets } = await import('../../../lib/redact');
                detail = redactLikelySecrets(String(err?.message || err));
            } catch {
                detail = String(err?.message || err);
            }
        }
        return new Response(safeStringify({ error: 'Internal Server Error', detail }), { status: 500, headers });
    }
}
