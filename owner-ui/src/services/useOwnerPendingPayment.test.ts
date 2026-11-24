import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOldestPendingPayment } from './useOwnerPendingPayment';

const row = (id: number, createdAt: string) => ({ id, createdAt, status: 'PendingPayment', orderType: 'delivery', updatedAt: '2026-11-19T12:00:00Z' });
const items = [row(1, '2026-11-19T10:00:00Z'), row(2, '2026-11-19T11:00:00Z')];

test('oldest pending uses creation time, existing sort/channel and exactly one thin list request', async () => {
  const original = globalThis.fetch;
  const calls: { path: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (path, init) => { calls.push({ path: String(path), init }); return Response.json({ items, total: 42 }); };
  try {
    assert.deepEqual(await loadOldestPendingPayment('delivery'), { count: 42, oldestCreatedAt: items[0].createdAt });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].path, 'http://isolated.invalid');
    assert.equal(url.pathname, '/api/admin/orders');
    assert.deepEqual(Object.fromEntries(url.searchParams), { Status: 'PendingPayment', Sort: 'oldest', Page: '1', Channel: 'delivery' });
    assert.equal(calls[0].init?.credentials, 'same-origin');
  } finally { globalThis.fetch = original; }
});

test('empty list is explicit and read failure recovers without a demonstrative or detail fallback', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => ++requests === 1 ? new Response('{}', { status: 503 }) : Response.json({ items: [], total: 0 });
  try {
    await assert.rejects(loadOldestPendingPayment(), /503/);
    assert.deepEqual(await loadOldestPendingPayment(), { count: 0, oldestCreatedAt: null });
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});

test('invalid dates, mismatched channels/status and unsupported ordering are rejected', async () => {
  const original = globalThis.fetch;
  try {
    for (const invalid of [[], [...items].reverse(), [{ ...items[0], createdAt: 'invalid' }],
      [{ ...items[0], status: 'Received' }], [{ ...items[0], orderType: 'pickup' }]]) {
      globalThis.fetch = async () => Response.json({ items: invalid, total: 42 });
      await assert.rejects(loadOldestPendingPayment('delivery'));
    }
  } finally { globalThis.fetch = original; }
});
