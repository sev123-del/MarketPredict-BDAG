const fs = require('fs');
const path = require('path');

function fail(msg) {
    console.error('SECURITY CHECK FAILED:', msg);
    process.exit(1);
}

// Check process env first
if (process.env.NEXT_PUBLIC_BDAG_RPC) {
    fail('NEXT_PUBLIC_BDAG_RPC is set in environment; do NOT expose private RPCs to the client.');
}

// Scan .env files in the project root and frontend folder for accidental NEXT_PUBLIC_BDAG_RPC
const candidates = [
    path.resolve(__dirname, '..', '.env.local'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '.env.production'),
    path.resolve(__dirname, '..', '..', '.env'),
];

for (const p of candidates) {
    try {
        if (!fs.existsSync(p)) continue;
        const content = fs.readFileSync(p, 'utf8');
        const re = /^\s*NEXT_PUBLIC_BDAG_RPC\s*=/m;
        if (re.test(content)) {
            fail(`Found NEXT_PUBLIC_BDAG_RPC in ${p}. Remove it before committing or building.`);
        }
    } catch (_) {
        // ignore read errors
    }
}

console.log('Secret env check passed. No NEXT_PUBLIC_BDAG_RPC found.');
