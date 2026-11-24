import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOrder, advanceOrder, type OrderDetailDto } from './ownerOrders';
import { clearAdminCsrf } from './adminHttp';
test('persisted discount and extra-inclusive price remain reconciled in operational orders', () => {
  const detail: OrderDetailDto = {
    order: { id: 8, createdAt: '2026-11-20T12:00:00Z', customerName: 'Cliente sintético', orderType: 'delivery',
      total: 40.46, status: 'Received', paymentMethod: 'Pix', paymentStatus: 'Approved' },
    discount: 3.94, customerPhone: '', street: null, houseNumber: null, neighborhood: null, city: null,
    deliveryFee: 5, items: [{ name: 'The Classic', quantity: 1, unitPrice: 39.4, subtotal: 39.4,
      observation: 'Sem cebola · Adicionais: 1x Queijo Cheddar Extra' }],
  };
  const order = mapOrder(detail);
  assert.equal(order.discount, 3.94);
  assert.equal(order.total, 40.46);
  assert.equal(Math.round((order.subtotal - order.discount + order.deliveryFee) * 100), Math.round(order.total * 100));
  assert.match(order.items[0].notes!, /Queijo Cheddar Extra/);
});
test('completed order never implies an approved payment', () => {
  const detail: OrderDetailDto = { order: { id: 7, createdAt: '2026-11-13T12:00:00Z', customerName: 'Cliente', orderType: 'delivery', total: 32, status: 'Completed', paymentMethod: 'Pix', paymentStatus: 'Pending' }, customerPhone: '', street: null, houseNumber: null, neighborhood: null, city: null, deliveryFee: 2, items: [{ name: 'Produto', quantity: 2, unitPrice: 15, subtotal: 30, observation: null }] };
  const order = mapOrder(detail);
  assert.equal(order.paymentStatus, 'PENDING');
  assert.equal(order.status, 'completed');
  assert.equal(order.subtotal, 30);
  assert.equal(order.items.length, 1);
});
test('status update includes concurrency guard and never payment fields', async () => {
  const original = globalThis.fetch;
  let mutation: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'PATCH') { mutation = init; return new Response(null, { status: 204 }); }
    return Response.json({ csrfToken: 'test-only' });
  };
  try {
    clearAdminCsrf();
    const checklist = { items: true, packaging: true, identification: true };
    await advanceOrder('7', 'ReadyForPickup', 'delivering', checklist);
    assert.deepEqual(JSON.parse(String(mutation?.body)), { expectedStatus: 'ReadyForPickup', status: 'OutForDelivery', checklist });
    assert.equal(new Headers(mutation?.headers).get('X-CSRF-TOKEN'), 'test-only');
  } finally { globalThis.fetch = original; clearAdminCsrf(); }
});
