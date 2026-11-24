import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleOrders, type ModuleOrderQuery } from './ownerOrders';
const base: ModuleOrderQuery = { currentModule: 'orders', queueSupportsFilters: true,
  activeOnly: true, requestedStatus: '', search: 'synthetic', orderPage: 2, channel: 'pickup' };
for (const [module, statuses] of [
  ['kitchen', ['Received', 'Preparing']], ['expedition', ['ReadyForPickup']],
  ['delivery', ['ReadyForPickup', 'OutForDelivery', 'Completed']],
] as const) test(`${module} keeps its operational queues and sort`, async () => {
  const original = globalThis.fetch; const urls: URL[] = [];
  globalThis.fetch = async path => { urls.push(new URL(String(path), 'https://localhost'));
    return Response.json({ items: [], total: 0, pageSize: 20 }); };
  try {
    const result = await loadModuleOrders({ ...base, currentModule: module }, new AbortController().signal);
    assert.equal(result.orders.length, 0);
    assert.deepEqual(urls.map(url => url.searchParams.get('Status')).sort(), [...statuses].sort());
    assert.ok(urls.every(url => url.pathname === '/api/admin/orders/operational'));
    if (module === 'delivery') assert.ok(urls.every(url => url.searchParams.get('Channel') === 'delivery'));
  } finally { globalThis.fetch = original; }
});
test('order screen keeps server pagination, search, channel and cancellation', async () => {
  const original = globalThis.fetch; const controller = new AbortController();
  globalThis.fetch = async (path, init) => {
    const url = new URL(String(path), 'https://localhost');
    assert.equal(url.searchParams.get('Page'), '2');
    assert.equal(url.searchParams.get('Search'), 'synthetic');
    assert.equal(url.searchParams.get('Channel'), 'pickup');
    assert.equal(init?.signal, controller.signal);
    return Response.json({ items: [], total: 0, pageSize: 20 });
  };
  try { await loadModuleOrders(base, controller.signal); } finally { globalThis.fetch = original; }
});
