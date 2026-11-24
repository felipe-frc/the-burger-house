import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjacentMonth, loadOrderMovement, movementByWeekday, movementCalendar, type OrderMovement } from './ownerMovement';

const february: OrderMovement = {
  start: '2024-02-01', end: '2024-02-29', today: '2024-02-20', schedule: null,
  hours: [{ date: '2024-02-05', hour: 19, count: 3 }, { date: '2024-02-05', hour: 21, count: 3 },
    { date: '2024-02-12', hour: 20, count: 2 }, { date: '2024-02-06', hour: 12, count: 1 }],
};

test('movement groups equivalent weekday slots and keeps activity outside an overnight shift', () => {
  const bands = movementByWeekday({ ...february, schedule: { enabled: true, start: '18:30', end: '02:00' } });
  assert.deepEqual(bands.map(band => band.label), ['00h–03h', '12h–15h', '18h–21h', '21h–00h']);
  assert.equal(bands[2].cells[0].count, 5);
  assert.equal(bands[1].cells[1].count, 1);
});

test('movement calendar aligns leap days and distinguishes zero orders from future dates', () => {
  const cells = movementCalendar(february);
  assert.deepEqual(cells.slice(0, 3), [null, null, null]);
  assert.equal(cells[3]?.label, '1');
  assert.equal(cells[7]?.count, 6);
  assert.equal(cells[7]?.peak, 'Pico 19h–20h · 3');
  assert.equal(cells[3]?.future, false);
  assert.equal(cells[3]?.count, 0);
  assert.equal(cells[31]?.label, '29');
  assert.equal(cells[31]?.future, true);
  assert.equal(adjacentMonth('2024-01', -1), '2023-12');
});

test('movement sends month and channel to its aggregate endpoint', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.equal(input, '/api/admin/orders/movement?month=2024-02&channel=pickup');
    return Response.json(february);
  };
  try { assert.deepEqual(await loadOrderMovement('2024-02', 'pickup', new AbortController().signal), february); }
  finally { globalThis.fetch = original; }
});
