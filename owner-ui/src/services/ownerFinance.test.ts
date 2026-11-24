import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grossRevenueShare, loadCategoryRevenue, loadFinance, loadFinanceAudit, loadFinanceReport, revenueCsv } from './ownerFinance';

test('channel share uses the total gross revenue and represents a period with no payments', () => {
  assert.equal(grossRevenueShare(200, 500), 40);
  assert.equal(grossRevenueShare(0, 500), 0);
  assert.equal(grossRevenueShare(0, 0), 0);
});
test('finance uses all five existing endpoints with same period and page; preserves negative net revenue', async () => {
  const original = globalThis.fetch; const paths: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input), 'https://localhost'); paths.push(url);
    return Response.json(url.pathname.endsWith('summary') ? { grossRevenue: 10, refundedAmount: 20, netRevenue: -10 } : url.pathname.endsWith('transactions') ? { items: [], total: 0, pageNumber: 2, pageSize: 20 } : []);
  };
  try {
    const [result] = await Promise.all([loadFinance('30d', 2), loadFinanceAudit('30d', 2)]);
    assert.equal(result.summary.netRevenue, -10);
    assert.equal(paths.length, 5);
    assert.ok(paths.every(url => url.searchParams.get('period') === '30d' && url.searchParams.get('page') === '2'));
    assert.deepEqual(paths.map(url => url.pathname.split('/').at(-1)).sort(), ['audit', 'payment-methods', 'revenue', 'summary', 'transactions']);
  } finally { globalThis.fetch = original; }
});
test('API failure propagates without demonstration fallback', async () => {
  const original = globalThis.fetch; globalThis.fetch = async () => new Response('{}', { status: 503 });
  try { await assert.rejects(loadFinance('today', 1), /HTTP 503/); } finally { globalThis.fetch = original; }
});
test('reports never depend on transactions or audit', async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async path => {
    const name = new URL(String(path), 'https://localhost').pathname.split('/').at(-1)!;
    paths.push(name);
    return Response.json(name === 'summary' ? { grossRevenue: 42 } : []);
  };
  try {
    assert.equal((await loadFinanceReport('today', 1)).summary.grossRevenue, 42);
    assert.deepEqual(paths.sort(), ['payment-methods', 'revenue', 'summary']);
  } finally { globalThis.fetch = original; }
});
test('report export contains only actual revenue points including empty periods', () => {
  assert.equal(revenueCsv([]), 'Data;ReceitaBruta\r\n');
  assert.equal(revenueCsv([{ date: '2026-11-14', revenue: 123.45 }]), 'Data;ReceitaBruta\r\n2026-11-14;123.45');
});
test('category revenue retains unclassified amounts and uses the selected period and channel', async () => {
  const original = globalThis.fetch;
  const report = { categories: [], unclassifiedRevenue: 30, deliveryFees: 5, unallocatedPayments: 6, grossRevenue: 41, refundedAmount: 8 };
  globalThis.fetch = async input => {
    const url = new URL(String(input), 'https://localhost');
    assert.equal(url.pathname, '/api/admin/finance/revenue-by-category');
    assert.equal(url.searchParams.get('period'), 'shift');
    assert.equal(url.searchParams.get('channel'), 'delivery');
    return Response.json(report);
  };
  try { assert.deepEqual(await loadCategoryRevenue('shift', 1, undefined, undefined, 'delivery'), report); }
  finally { globalThis.fetch = original; }
});
