import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasSingleRevenueDay, kitchenTimingSummary } from './ownerOverview';
import { mapOrder } from './ownerOrders';
import { withOperationalTiming } from './ownerPresentation';

const now = Date.parse('2026-11-18T22:00:00Z');
const since = new Date(now - 224 * 60000).toISOString();
const order = mapOrder({
  order: { id: 1, createdAt: since, customerName: 'Teste', orderType: 'pickup', total: 10,
    status: 'Received', paymentMethod: 'Pix', paymentStatus: 'Approved' },
  customerPhone: '', street: null, houseNumber: null, neighborhood: null, city: null,
  deliveryFee: 0, items: [],
});

test('kitchen average can be 224 minutes with zero delays when the configured limit is disabled', () => {
  const limits = { preparing: 0, readyForPickup: 0, outForDelivery: 0 };
  const summary = kitchenTimingSummary([withOperationalTiming(order, now, limits)]);
  assert.deepEqual(summary, { total: 1, measured: 1, delayed: 0, meanMinutes: 224 });
  assert.equal(kitchenTimingSummary([withOperationalTiming(order, now, { ...limits, preparing: 180 })]).delayed, 1);
  assert.equal(kitchenTimingSummary([withOperationalTiming(order, now, { ...limits, preparing: 224 })]).delayed, 1);
  assert.equal(kitchenTimingSummary([withOperationalTiming(order, now, { ...limits, preparing: 225 })]).delayed, 0);
});

test('kitchen timing excludes unpaid, completed and undated preparing entries from its measured population', () => {
  const current = withOperationalTiming(order, now, { preparing: 180, readyForPickup: 0, outForDelivery: 0 });
  const summary = kitchenTimingSummary([
    current, { ...current, status: 'preparing', stageStartedAt: undefined },
    { ...current, paymentStatus: 'PENDING' }, { ...current, status: 'completed' },
  ]);
  assert.deepEqual(summary, { total: 2, measured: 1, delayed: 1, meanMinutes: 224 });
  assert.equal(kitchenTimingSummary([]).meanMinutes, null);
});

test('single day context requires the complete chronological period with confirmed zero revenue on other dates', () => {
  const points = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-11-${12 + index}`, revenue: index === 6 ? 79.7 : 0,
  }));
  assert.equal(hasSingleRevenueDay(points, 7), true);
  assert.equal(hasSingleRevenueDay(points.slice(1), 7), false);
  assert.equal(hasSingleRevenueDay(points.map(point => ({ ...point, revenue: 0 })), 7), false);
  assert.equal(hasSingleRevenueDay([...points.slice(0, 6), { date: '2026-11-19', revenue: 79.7 }], 7), false);
});
