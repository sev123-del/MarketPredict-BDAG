// Lightweight Redis client wrapper with in-memory fallback.
// Prefers `redis` (node-redis) when `REDIS_URL` is present; falls back to Map.

let redis = null;
let usingRedis = false;

async function createRedis() {
    if (process.env.REDIS_URL) {
        try {
            // Prefer node-redis. It uses the WHATWG URL API and avoids url.parse() warnings.
            // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
            const { createClient } = require('redis');

            const client = createClient({
                url: process.env.REDIS_URL,
                socket: {
                    // Keep reconnect strategy bounded.
                    reconnectStrategy: (retries) => Math.min(50 * retries, 1000),
                },
            });

            client.on('error', () => {
                // swallow; fallback will be used
            });

            await client.connect();
            // quick probe
            await client.ping();
            usingRedis = true;
            return client;
        } catch {
            // fall through to in-memory fallback
            usingRedis = false;
        }
    }
    usingRedis = false;
    return null;
}

const memory = new Map();

async function getRedis() {
    if (redis === null) redis = await createRedis();
    return redis;
}

async function get(key) {
    const client = await getRedis();
    if (client) {
        const v = await client.get(key);
        return v;
    }
    return memory.has(key) ? memory.get(key) : null;
}

async function setex(key, seconds, value) {
    const client = await getRedis();
    if (client) {
        // node-redis uses setEx
        await client.setEx(key, seconds, value);
        return true;
    }
    memory.set(key, value);
    setTimeout(() => memory.delete(key), seconds * 1000);
    return true;
}

async function incr(key) {
    const client = await getRedis();
    if (client) return client.incr(key);
    const v = Number(memory.get(key) || 0) + 1;
    memory.set(key, String(v));
    return v;
}

async function expire(key, seconds) {
    const client = await getRedis();
    if (client) return client.expire(key, seconds);
    // no-op for memory (handled in setex)
    return 1;
}

async function del(key) {
    const client = await getRedis();
    if (client) return client.del(key);
    memory.delete(key);
    return 1;
}

module.exports = { get, setex, incr, expire, del, usingRedis: () => usingRedis };
