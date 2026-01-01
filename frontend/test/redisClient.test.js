import { test, expect } from 'vitest';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const requireC = createRequire(import.meta.url);
const redis = requireC('../src/lib/redisClient.js');

test('secret check script exits successfully', () => {
  // Should exit 0 when NEXT_PUBLIC_BDAG_RPC is not present
  execSync('node ./scripts/check-no-public-rpc.js', { stdio: 'ignore' });
});

test('redisClient basic in-memory operations', async () => {
  // setex/get/del should work using in-memory fallback if Redis not configured
  await redis.setex('test:kc', 1, 'v1');
  const v = await redis.get('test:kc');
  expect(v).toBe('v1');
  await redis.del('test:kc');
  const v2 = await redis.get('test:kc');
  expect(v2 === null || v2 === undefined).toBe(true);
});

test('redisClient set/get works (no expiry)', async () => {
  await redis.set('test:set', 'hello');
  const v = await redis.get('test:set');
  expect(v).toBe('hello');
  await redis.del('test:set');
});
