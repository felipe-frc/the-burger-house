import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { request } from '@playwright/test';

// Manual opt-in only. Creates one synthetic order and an unpaid external sandbox checkout.
// Never submits card details, executes Pix, approves a payment, or sends a webhook.
assert.equal(process.env.TBH_EXTERNAL_SANDBOX, '1', 'Explicit external sandbox opt-in required.');
const root = (await readFile('test-results/acceptance/homologation-path.txt', 'utf8')).trim();
const id = createHash('sha256').update(process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root)).digest('hex');
const api = await request.newContext({ baseURL: 'https://localhost:4174', ignoreHTTPSErrors: true, timeout: 30000 });
const report = { externalSandbox: true, paymentExecuted: false, webhookSent: false, checks: [] };
try {
  const identity = await (await api.get('/api/homologation/info')).json();
  assert.equal(identity.database, 'burgerhouse.homologation.db');
  assert.equal(identity.provider, 'SQLite');
  assert.equal(identity.environmentId, id);
  assert.equal(identity.localCheckout, true);
  assert.equal((await (await api.get('/homologation-info')).json()).checkoutEnabled, true);
  const catalog = await (await api.get('/api/products')).json();
  const product = catalog.find(product => product.name === 'The Classic' && product.isActive);
  assert(product && product.code.startsWith('demo-'));
  let order;
  if (process.env.TBH_SANDBOX_ORDER_ID) {
    assert.match(process.env.TBH_SANDBOX_ORDER_ID, /^[1-9][0-9]*$/);
    order = { orderId: Number(process.env.TBH_SANDBOX_ORDER_ID), total: product.price };
    report.checks.push({ operation: 'resume existing synthetic order', noAdditionalOrderCreated: true });
  } else {
    const created = await api.post('/api/orders', { data: {
    orderType: 'pickup', customerName: 'Cliente Sintetico Sandbox', customerPhone: '11999990000',
    customerEmail: 'sandbox.fixture@example.invalid', customerTaxId: '52998224725',
    observation: 'Homologacao descartavel, sem realizar pagamento.',
    items: [{ productCode: product.code, quantity: 1 }],
  } });
  assert([200, 201].includes(created.status()));
    order = await created.json();
    report.checks.push({ operation: 'synthetic order', http: created.status(), totalMatchesCatalog: true });
  }
  assert(Number.isInteger(order.orderId) && order.orderId > 0);
  assert.equal(order.total, product.price);
  report.orderId = order.orderId;
  await writeFile('test-results/corrective-audit/external-checkout.json', JSON.stringify(report, null, 2));
  const checkout = await api.post('/api/checkout/' + order.orderId);
  report.checks.push({ operation: 'external sandbox checkout', http: checkout.status() });
  assert.equal(checkout.status(), 200);
  const first = await checkout.json();
  const url = new URL(first.checkoutUrl);
  assert.equal(url.protocol, 'https:');
  assert(['pagamento.sandbox.pagbank.com.br', 'checkout.sandbox.pagseguro.uol.com.br'].includes(url.hostname));
  const resumed = await api.post('/api/checkout/' + order.orderId);
  assert.equal(resumed.status(), 200);
  const second = await resumed.json();
  assert.equal(second.paymentId, first.paymentId);
  assert.equal(second.checkoutUrl, first.checkoutUrl);
  const paymentResponse = await api.get('/api/payments/' + first.paymentId);
  assert.equal(paymentResponse.status(), 200);
  const payment = await paymentResponse.json();
  assert.equal(payment.amount, product.price);
  assert.equal(payment.orderId, order.orderId);
  assert.equal(payment.status, 1); // PaymentStatus.Pending: no payment has been executed.
  report.checks.push({ operation: 'resume', http: resumed.status(), samePayment: true, sameCheckout: true },
    { operation: 'payment persisted', http: paymentResponse.status(), pending: true, amountMatches: true });
  report.redirectHost = url.hostname;
  report.orderId = order.orderId; report.paymentId = first.paymentId;
  await writeFile('test-results/corrective-audit/external-checkout.json', JSON.stringify(report, null, 2));
  console.log('External sandbox: checkout created, resumed without duplication, payment pending. No payment executed.');
} finally { await api.dispose(); }
