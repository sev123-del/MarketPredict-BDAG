import { test, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const requireC = createRequire(import.meta.url);
const redis = requireC('../src/lib/redisClient.js');

async function resetDraftsKey() {
  await redis.del('drafts:v1');
}

test('draftsStore can add/list/approve using redisClient fallback', async () => {
  await resetDraftsKey();

  const { addDraft, listDrafts, approveDraft } = await import('../src/lib/draftsStore.js');

  const closeTimeIso = new Date(Date.now() + 60_000).toISOString();
  const created = await addDraft({
    question: 'Will BTC close above $100k on Jan 1?',
    description: 'Test draft',
    category: 'Crypto',
    closeTimeIso,
    marketType: 'manual',
  });

  expect(created.ok).toBe(true);
  expect(created.value.status).toBe('pending');

  const pending = await listDrafts('pending');
  expect(Array.isArray(pending)).toBe(true);
  expect(pending.length).toBeGreaterThan(0);

  const updated = await approveDraft(created.value.id, '0xabc');
  expect(updated.ok).toBe(true);
  expect(updated.value.status).toBe('approved');

  const approved = await listDrafts('approved');
  expect(approved.some((d) => d.id === created.value.id)).toBe(true);

  await resetDraftsKey();
});

beforeEach(async () => {
  // keep tests isolated even if other specs interact with the same key
  await resetDraftsKey();
});
