import assert from 'node:assert/strict';
import test from 'node:test';
import { createShowcase, ShowcaseError } from './ownerShowcaseTransport';
import { demoClock } from './ownerShowcase';
import type { OrderDetailDto } from './ownerOrders';
import { mapOrder } from './ownerOrders';
import { formatOwnerDateTime, formatOwnerPercentage, isActiveStatus, isKitchenOrder, isOnShift, statusDistribution, statusKeys, withOperationalTiming, type ServerOrderStatus } from './ownerPresentation';
import { isLowStock, stockCondition, stockIndicators, type StockRecord } from './ownerStock';
import { summarizeQueues, type Dashboard } from './useOwnerDashboard';
import type { FinanceSummary, RevenuePoint } from './ownerFinance';

const demo = createShowcase();
const get = <T>(path: string) => demo('/api/admin/' + path) as T;
const dashboard = get<Dashboard>('dashboard');
const { counts, delivery } = summarizeQueues(dashboard.orderCounts!);
type OperationalPage = { items: OrderDetailDto[]; total: number; pageSize: number };
const operational = (params = '') => get<OperationalPage>('orders/operational?' + params);
const activeTotal = statusKeys.filter(isActiveStatus).reduce((sum, status) => sum + counts[status], 0);

test('01 status counts cover every order in the same population as the header', () => {
  const distribution = statusDistribution(counts);
  assert.equal(distribution.total, operational().total);
  assert.equal(distribution.states.length, 7);
  assert.equal(Math.round(distribution.states.reduce((sum, state) => sum + state.percentage, 0)), 100);
});

test('02 badges use active counts and operational lists independently of page or navigation', () => {
  const count = (status: string, extra = '') => operational('Status=' + status + extra).total;
  assert.equal(operational('ActiveOnly=true').total, activeTotal);
  assert.equal(activeTotal, 49);
  assert.equal(counts.Received + counts.Preparing, count('Received') + count('Preparing'));
  assert.equal(counts.ReadyForPickup, count('ReadyForPickup'));
  assert.equal(delivery, count('ReadyForPickup', '&Channel=delivery') + count('OutForDelivery', '&Channel=delivery'));
});

test('03 seven days include today, and a shift sample is a subset of the day', () => {
  const hourly = get<RevenuePoint[]>('finance/revenue?period=today&granularity=hour');
  assert.equal(hourly.length, 24);
  const shift = hourly.filter(point => isOnShift('18:00 - 23:00', Date.parse(point.date + ':00-03:00')))
    .reduce((sum, point) => sum + point.revenue, 0);
  assert.ok(dashboard.week.grossRevenue >= dashboard.today.grossRevenue);
  assert.ok(dashboard.today.grossRevenue >= shift && shift > 0);
  assert.equal(shift, dashboard.shift!.summary.grossRevenue);
  assert.deepEqual(dashboard.shift!.summary, get<FinanceSummary>('finance/summary?period=shift'));
  assert.equal(isOnShift('22:00 - 06:00', Date.parse('2026-11-18T01:00:00-03:00')), true);
});

test('04 dashboard day equals approved finance, chart, channel sums and ticket denominator', () => {
  const summary = get<FinanceSummary>('finance/summary?period=today');
  assert.deepEqual(dashboard.today, summary);
  assert.equal(summary.averageTicket, Math.round(summary.grossRevenue * 100 / summary.paidOrders) / 100);
  const points = get<RevenuePoint[]>('finance/revenue?period=today&granularity=hour');
  assert.equal(points.reduce((sum, row) => sum + row.revenue, 0), summary.grossRevenue);
  const channels = ['delivery', 'pickup'].map(channel => get<FinanceSummary>('finance/summary?period=today&channel=' + channel));
  assert.equal(channels.reduce((sum, row) => sum + row.grossRevenue, 0), summary.grossRevenue);
});

test('05 only approved received/preparing orders can contribute to the kitchen delay alert', () => {
  const mapped = statusKeys.flatMap(status => operational('Status=' + status).items.map(mapOrder));
  const limits = { preparing: 20, readyForPickup: 12, outForDelivery: 35 };
  const late = mapped.map(order => withOperationalTiming(order, demoClock, limits)).filter(order => order.isDelayed && isKitchenOrder(order));
  assert.ok(late.length);
  assert.ok(late.every(order => order.serverStatus === 'Received' || order.serverStatus === 'Preparing'));
  const awaiting = mapped.find(order => order.serverStatus === 'PendingPayment')!;
  assert.equal(isKitchenOrder(awaiting), false);
  assert.equal(withOperationalTiming(awaiting, demoClock, limits).isDelayed, false);
  const oldPending = mapped.filter(order => order.serverStatus === 'PendingPayment').at(-1)!;
  const flagged = withOperationalTiming(oldPending, demoClock, { ...limits, pendingPaymentAgeHours: 1 });
  assert.equal(flagged.isStalePayment, true);
  assert.equal(flagged.serverStatus, 'PendingPayment');
  assert.equal(withOperationalTiming(late[0], demoClock, { ...limits, preparing: 0 }).isDelayed, false);
});

test('06 inventory alert and list agree at and below the minimum', () => {
  const stock = get<StockRecord[]>('stock');
  assert.equal(stock.filter(isLowStock).length, 2);
  const first = stock[0];
  assert.equal(isLowStock({ ...first, quantity: first.minimum }), false);
});

test('stock indicators use real balances and calculate fractional replenishment', () => {
  const base = { id: 1, name: 'Insumo', unit: 'kg', revision: 1, minimum: 5.1, quantity: 0 };
  const rows = [base, { ...base, id: 2, quantity: 3.005 }, { ...base, id: 3, quantity: 5.1 }];
  assert.deepEqual(rows.map(stockCondition), [
    { shortage: 5.1, state: 'empty' }, { shortage: 2.095, state: 'low' }, { shortage: 0, state: 'adequate' },
  ]);
  assert.deepEqual(stockIndicators(rows), { total: 3, low: 2, empty: 1, adequate: 1 });
  assert.deepEqual(stockCondition({ ...base, minimum: 0 }), { shortage: 0, state: 'empty' });
});

test('07 pagination tracks visible entries without overlap or a false zero', () => {
  const pages = [1, 2, 3].map(p => operational('ActiveOnly=true&Page=' + p));
  assert.deepEqual(pages.map(p => p.items.length), [20, 20, 9]);
  assert.ok(pages.every(page => page.total === activeTotal));
  assert.equal(new Set(pages.flatMap(page => page.items.map(row => row.order.id))).size, activeTotal);
  assert.equal(operational('Search=no-such-order').total, 0);
});

test('08 margin is absent when there is no cost coverage', () => {
  const empty = get<FinanceSummary>('finance/summary?period=custom&start=2025-11-17&end=2025-11-17');
  assert.equal(empty.grossProfit, null);
  assert.equal(empty.ordersWithCost, 0);
  assert.ok(dashboard.today.ordersWithCost > 0 && dashboard.today.ordersWithCost < dashboard.today.paidOrders);
});

test('09 UTC, explicit offsets and Brazilian percentage render consistently', () => {
  const time = '2026-11-18T00:05:00';
  assert.equal(formatOwnerDateTime(time), formatOwnerDateTime(time + 'Z'));
  assert.equal(formatOwnerDateTime(time), formatOwnerDateTime('2026-11-17T21:05:00-03:00'));
  assert.match(formatOwnerDateTime(time), /17\/11\/2026.*21:05/);
  assert.equal(formatOwnerPercentage(21.36), '21,4%');
});

test('10 demo IDs cannot overlap the production int space, and the fixture is deterministic', () => {
  const first = operational();
  const second = createShowcase()('/api/admin/orders/operational') as OperationalPage;
  assert.deepEqual(first, second);
  assert.ok(first.items.every(row => row.order.id > 2_147_483_647));
  assert.throws(() => demo('/api/admin/auth/change-password', { method: 'POST' }), (error: unknown) => error instanceof ShowcaseError && error.status === 403);
});

test('operational transitions reject stale/invalid moves, require complete dispatch, and preserve money', () => {
  const request = createShowcase();
  const row = (request('/api/admin/orders/operational?Status=Received&Channel=delivery') as OperationalPage).items[0];
  const path = '/api/admin/orders/' + row.order.id;
  const advance = (expectedStatus: ServerOrderStatus, status: ServerOrderStatus, checklist?: object) =>
    request(path + '/status', { method: 'PATCH', body: JSON.stringify({ expectedStatus, status, checklist }) });
  assert.throws(() => advance('Received', 'Completed'), (error: unknown) => error instanceof ShowcaseError && error.status === 409);
  advance('Received', 'Preparing');
  assert.throws(() => advance('Received', 'Preparing'), (error: unknown) => error instanceof ShowcaseError && error.status === 409);
  advance('Preparing', 'ReadyForPickup');
  assert.throws(() => advance('ReadyForPickup', 'OutForDelivery', { items: true, packaging: false, identification: true }),
    (error: unknown) => error instanceof ShowcaseError && error.status === 400);
  advance('ReadyForPickup', 'OutForDelivery', { items: true, packaging: true, identification: true });
  advance('OutForDelivery', 'Completed');
  const completed = request(path) as OrderDetailDto;
  assert.equal(completed.order.status, 'Completed');
  assert.equal(completed.order.total, row.order.total);
  assert.equal(completed.order.paymentStatus, 'Approved');
  assert.deepEqual(completed.stageHistory?.map(item => item.status), ['Preparing', 'ReadyForPickup', 'OutForDelivery', 'Completed']);
});
