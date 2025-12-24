// Lightweight Redis client wrapper with in-memory fallback.
// Uses `ioredis` if `REDIS_URL` is present and installable; otherwise falls back to Map.

let redis = null;
let usingRedis = false;

async function createRedis() {
    if (process.env.REDIS_URL) {
        try {
            // lazy require so installs aren't mandatory for development
            // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
            const IORedis = require('ioredis');
            const client = new IORedis(process.env.REDIS_URL);
            client.on('error', () => {
                // swallow; fallback will be used
            });
            // test a ping
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
        await client.setex(key, seconds, value);
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
