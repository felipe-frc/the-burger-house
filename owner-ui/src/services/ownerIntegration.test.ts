import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOrderPage } from './ownerOrders';
import { saveOperationSettings } from './ownerSettings';
import { loadNotifications } from './ownerNotifications';
import { clearAdminCsrf } from './adminHttp';
for (const size of [0, 1, 20]) test('operational page uses one request for ' + size + ' orders', async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  const items = Array.from({ length: size }, (_, id) => ({
    order: { id: id + 1, createdAt: '2026-11-16T10:00:00Z', customerName: 'Fixture', orderType: 'delivery',
      total: 12, status: 'Preparing', paymentMethod: 'Pix', paymentStatus: 'Approved' },
    customerPhone: '11999990000', street: 'Rua Teste', houseNumber: '1', neighborhood: null, city: null,
    deliveryFee: 2, items: [{ name: 'Burger', quantity: 1, unitPrice: 10, subtotal: 10, observation: 'Sem molho' }],
  }));
  globalThis.fetch = async path => { paths.push(String(path)); return Response.json({ items, total: 45, pageSize: 20 }); };
  try {
    const page = await loadOrderPage(2, undefined, 'Preparing', 'Fixture');
    assert.equal(page.total, 45);
    assert.equal(page.pageSize, 20);
    assert.deepEqual(page.rows, items.map(item => item.order));
    assert.deepEqual(page.orders.map(order => order.id), items.map(item => String(item.order.id)));
    if (size) {
      assert.equal(page.orders[0].items[0].notes, 'Sem molho');
      assert.equal(page.orders[0].deliveryAddress, 'Rua Teste, 1');
      assert.equal(page.orders[0].paymentStatus, 'PAID');
    }
    assert.equal(paths.length, 1);
    const url = new URL(paths[0], 'https://localhost');
    assert.equal(url.pathname, '/api/admin/orders/operational');
    assert.equal(url.searchParams.get('Search'), 'Fixture');
    assert.equal(url.searchParams.get('Status'), 'Preparing');
    assert.equal(url.searchParams.get('Page'), '2');
  } finally { globalThis.fetch = original; }
});
test('missing operational route falls back to published order list and details', async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  const order = { id: 108, createdAt: '2026-11-16T10:00:00Z', customerName: 'Fixture', orderType: 'pickup',
    total: 12, status: 'Received', paymentMethod: 'Pix', paymentStatus: 'Approved' };
  globalThis.fetch = async path => {
    const url = new URL(String(path), 'https://localhost');
    paths.push(url.pathname);
    if (url.pathname.endsWith('/operational')) return new Response(null, { status: 404 });
    if (url.pathname.endsWith('/108')) return Response.json({ order, customerPhone: '11999990000', items: [], deliveryFee: 0 });
    assert.equal(url.searchParams.get('Status'), 'Received');
    assert.equal(url.searchParams.get('Page'), '2');
    assert.equal(url.searchParams.get('Search'), 'Fixture');
    return Response.json({ items: [order], total: 21, pageSize: 20 });
  };
  try {
    const page = await loadOrderPage(2, undefined, 'Received', 'Fixture');
    assert.equal(page.orders[0].paymentStatus, 'PAID');
    assert.equal(page.total, 21);
    assert.deepEqual(paths, ['/api/admin/orders/operational', '/api/admin/orders', '/api/admin/orders/108']);
  } finally { globalThis.fetch = original; }
});
test('a 503 from the operational route propagates without falling back', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 503 }); };
  try {
    await assert.rejects(loadOrderPage(1), /HTTP 503/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('settings preserve revision and reload after confirmed write', async () => {
  const original = globalThis.fetch;
  const settings = { revision: 4, limits: { preparing: 20, readyForPickup: 10, outForDelivery: 30 } };
  const methods: string[] = [];
  globalThis.fetch = async (path, init) => {
    if (String(path).endsWith('/auth/login')) return Response.json({ csrfToken: 'test' });
    methods.push(init!.method!);
    if (init?.method === 'PUT') { assert.deepEqual(JSON.parse(String(init.body)), settings); return new Response(null, { status: 204 }); }
    return Response.json({ ...settings, revision: 5 });
  };
  try { clearAdminCsrf(); assert.equal((await saveOperationSettings(settings)).revision, 5); assert.deepEqual(methods, ['PUT', 'GET']); }
  finally { globalThis.fetch = original; clearAdminCsrf(); }
});
test('empty notifications do not synthesize demo data', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [] });
  try { assert.deepEqual((await loadNotifications()).items, []); } finally { globalThis.fetch = original; }
});
test('notification pagination keeps the original window and advances the cursor', async () => {
  const original = globalThis.fetch;
  const since = '2026-11-14T10:00:00Z';
  const until = '2026-11-14T10:01:00Z';
  const requests: URL[] = [];
  globalThis.fetch = async path => {
    requests.push(new URL(String(path), 'https://localhost'));
    const id = requests.length;
    return Response.json({ until, nextAfterId: id === 1 ? id : null, items: [{ id, createdAt: until, customerName: 'Cliente' }] });
  };
  try {
    const result = await loadNotifications(undefined, since);
    assert.deepEqual(result.items.map(item => item.id), ['1', '2']);
    assert.equal(result.until, until);
    assert.equal(requests[1].searchParams.get('since'), since);
    assert.equal(requests[1].searchParams.get('until'), until);
    assert.equal(requests[1].searchParams.get('afterId'), '1');
  } finally { globalThis.fetch = original; }
});
