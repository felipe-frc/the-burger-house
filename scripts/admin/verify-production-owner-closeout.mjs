// Read-only business verification; only login/logout POSTs are allowed.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const origin = 'https://the-burger-house-api-gqfkakgnfvfxd0g0.brazilsouth-01.azurewebsites.net';
const reportPath = 'test-results/technical-closeout/production-owner.json';
const impact = JSON.parse(await readFile('test-results/catalog-final/production-impact.json', 'utf8'));
const inventory = impact.before?.products ?? impact.products;
assert.ok(Array.isArray(inventory), 'Reviewed production inventory required');
const kept = inventory.filter(p => p.decision === 'MANTER');
const removed = [1, 2, 24, 25, 28, 29, 30, 31, 32, 34];
const cookies = new Map();
let csrf = '', authenticated = false;
const report = { startedAt: new Date().toISOString(), origin, status: 'running', requests: [], businessWrites: 0, paymentQueriesTriggeringReconciliation: 0 };
await mkdir('test-results/technical-closeout', { recursive: true });
async function request(path, { method = 'GET', body, expected = 200, sendCsrf = true } = {}) {
  assert.ok(method === 'GET' || method === 'POST' && ['/api/admin/auth/login', '/api/admin/auth/logout'].includes(path), 'Business writes forbidden');
  const response = await fetch(origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(25000),
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      ...(method === 'POST' && csrf && sendCsrf ? { 'X-CSRF-TOKEN': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0], split = pair.indexOf('=');
    if (split > 0) cookies.set(pair.slice(0, split), pair.slice(split + 1));
  }
  report.requests.push({ method, path, status: response.status });
  assert.equal(response.status, expected, `${method} ${path}: HTTP unexpected`);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (data?.csrfToken) csrf = data.csrfToken;
  return data;
}
async function pageAll(path) {
  const first = await request(path + (path.includes('?') ? '&' : '?') + 'page=1');
  assert.ok(Array.isArray(first.items));
  const items = [...first.items];
  for (let page = 2; items.length < first.total && page <= 10; page++) {
    const next = await request(path + (path.includes('?') ? '&' : '?') + 'page=' + page);
    assert.equal(next.total, first.total); assert.ok(next.items.length > 0); items.push(...next.items);
  }
  assert.equal(items.length, first.total); return items;
}
try {
  await request('/api/admin/products', { expected: 401 });
  await request('/api/admin/auth/login');
  assert.ok(csrf, 'CSRF token required');
  assert.ok(process.env.BURGER_ADMIN_EMAIL && process.env.BURGER_ADMIN_PASSWORD, 'Private terminal credentials required');
  await request('/api/admin/auth/login', { method: 'POST', body: { email: process.env.BURGER_ADMIN_EMAIL, password: process.env.BURGER_ADMIN_PASSWORD } });
  authenticated = true;
  delete process.env.BURGER_ADMIN_PASSWORD; delete process.env.BURGER_ADMIN_EMAIL;
  const me = await request('/api/admin/auth/me'); assert.equal(me.role, 'Owner'); assert.ok(me.csrfToken);
  report.ownerSessionValidated = true;
  const products = await request('/api/admin/products');
  assert.equal(products.length, 15);
  assert.deepEqual(products.map(p => p.id).sort((a,b) => a-b), kept.map(p => p.id).sort((a,b) => a-b));
  for (const p of kept) assert.equal(products.find(a => a.id === p.id)?.name, p.name);
  report.products = { count: 15, legacyAbsent: true, ids: products.map(p => p.id).sort((a,b) => a-b) };
  const orders = await pageAll('/api/admin/orders'); assert.equal(orders.length, 26);
  assert.equal(new Set(orders.map(o => o.id)).size, 26);
  assert.ok(orders.every(o => !removed.includes(o.id)));
  const details = [];
  for (const row of orders) {
    const d = await request('/api/admin/orders/' + row.id);
    assert.equal(d.order.id, row.id); assert.equal(d.payments.length, 1);
    const cents = value => Math.round(value * 100);
    assert.equal(d.items.reduce((sum, i) => sum + cents(i.unitPrice) * i.quantity, 0) + cents(d.deliveryFee), cents(d.order.total));
    assert.equal(cents(d.payments[0].amount), cents(d.order.total));
    details.push({ orderId: row.id, itemRows: d.items.length, status: d.order.status, paymentStatus: d.payments[0].status, method: d.payments[0].method, amount: d.payments[0].amount });
  }
  assert.equal(details.reduce((sum, d) => sum + d.itemRows, 0), 33);
  report.orders = { count: 26, paymentCount: 26, itemRows: 33, monetaryMismatches: 0, details };
  for (const id of removed) await request('/api/admin/orders/' + id, { expected: 404 });
  const period = '?period=custom&start=2026-01-01&end=2026-12-31';
  const transactions = await pageAll('/api/admin/finance/transactions' + period);
  assert.equal(transactions.length, 26);
  const audit = await request('/api/admin/finance/audit' + period); assert.ok(Array.isArray(audit));
  assert.equal(audit.length, 23); assert.equal(audit.filter(a => a.action === 'LegacyCatalogCleanup').length, 1);
  report.audit = { count: audit.length, cleanupMaintenanceCount: 1 };
  // A logout without CSRF cannot mutate products, orders or payment state.
  await request('/api/admin/auth/logout', { method: 'POST', sendCsrf: false, expected: 400 });
  await request('/api/admin/auth/me'); report.csrfRejectionVerified = true;
  await request('/api/admin/auth/logout', { method: 'POST', expected: 204 }); authenticated = false;
  await request('/api/admin/auth/me', { expected: 401 }); report.logoutAndSessionRevocationVerified = true;
  report.status = 'passed';
} catch (error) {
  report.status = 'blocked'; report.failure = String(error.message).replace(/https?:\/\/\S+/g, '[URL]'); process.exitCode = 1;
} finally {
  delete process.env.BURGER_ADMIN_PASSWORD; delete process.env.BURGER_ADMIN_EMAIL;
  if (authenticated) { try { await request('/api/admin/auth/logout', { method: 'POST', expected: 204 }); } catch { report.sessionCleanupUnconfirmed = true; } }
  cookies.clear(); csrf = ''; report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, reportPath, ownerSessionValidated: report.ownerSessionValidated, products: report.products?.count, orders: report.orders?.count, payments: report.orders?.paymentCount, failure: report.failure }, null, 2));
}
