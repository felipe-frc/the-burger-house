import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCustomers } from './ownerCustomers';
test('customers derive totals only from approved purchases without inventing personal data', () => {
  const [customer] = mapCustomers([{ name: 'Cliente', purchases: [
    { orderId: 1, approvedAmount: 25.5, createdAt: '2026-01-01T12:00:00Z' },
    { orderId: 2, approvedAmount: 10, createdAt: '2026-02-01T12:00:00Z' },
  ] }]);
  assert.equal(customer.totalSpent, 35.5);
  assert.equal(customer.ordersCount, 2);
  assert.equal(customer.phone, '');
  assert.equal(customer.email, '');
  assert.equal(customer.lastOrderDate, '2026-02-01T12:00:00Z');
  assert.deepEqual(mapCustomers([]), []);
});
