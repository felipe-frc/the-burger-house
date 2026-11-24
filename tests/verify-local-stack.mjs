import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.TBH_STACK_ORIGIN;
assert(['https://127.0.0.1:55485', 'https://localhost:4174'].includes(origin), 'Explicit local origin required.');
const portfolio = origin.endsWith(':55485');
const expected = portfolio ? 'tbh_portfolio_dev' : 'burgerhouse.homologation.db';
const password = process.env.HOMOLOGATION_OWNER_PASSWORD;
assert(password, 'Load the existing protected Owner password privately.');
const report = { origin, expectedDatabase: expected, syntheticWrites: false, checks: [], modules: [], serverErrors: [] };
const evidenceDirectory = resolve(process.env.TBH_STACK_EVIDENCE_DIRECTORY || 'test-results/corrective-audit');
assert(evidenceDirectory.startsWith(resolve('test-results') + sep));
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
let context;
let authenticated = false;
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const api = context.request;
  async function status(path, expectedStatus = 200) {
    const response = await api.get(origin + path);
    report.checks.push({ path, http: response.status() });
    assert.equal(response.status(), expectedStatus, path);
    return response;
  }
  const identity = await (await status('/api/homologation/info')).json();
  assert.equal(identity.database, expected);
  assert.equal(identity.provider, portfolio ? 'PostgreSQL' : 'SQLite');
  assert.match(identity.environmentId, /^[a-f0-9]{64}$/);
  report.provider = identity.provider;
  const gateway = await (await status('/homologation-info')).json();
  assert.equal(gateway.checkoutEnabled, portfolio ? identity.portfolio === true && identity.sandboxCredentialValidated === true : true);
  report.checkoutEnabled = gateway.checkoutEnabled;
  const checkoutProbe = await api.post(origin + '/api/checkout/0');
  assert.equal(checkoutProbe.status(), gateway.checkoutEnabled ? 400 : 503);
  report.invalidOrderCheckoutHttp = checkoutProbe.status(); // Invalid ID cannot create a payment.
  await status('/api/admin/orders/operational', 401);
  const products = await (await status('/api/products')).json();
  const activeProducts = products.filter(product => product.isActive);
  assert.equal(activeProducts.length, 15);
  assert(activeProducts.every(p => Number.isFinite(p.price) && p.price > 0));
  report.activeProducts = activeProducts.length;
  report.catalogRowsIncludingInactiveHistory = products.length;
  const html = await (await status('/admin/')).text();
  for (const path of [...new Set(html.match(/\/admin\/assets\/[^"\s]+\.(?:css|js)/g))]) {
    const response = await status(path);
    assert.match(response.headers()['content-type'], path.endsWith('.js') ? /javascript/ : /text\/css/);
  }
  await status('/admin/assets/missing.js', 404);
  const page = await context.newPage();
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === origin && url.pathname.startsWith('/api/') && response.status() >= 500)
      report.serverErrors.push({ path: url.pathname, http: response.status() });
  });
  await page.goto(origin + '/admin/');
  await page.getByLabel('E-mail', { exact: true }).fill('owner.homologation@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill(password);
  const login = page.waitForResponse(response => response.url().endsWith('/api/admin/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  assert.equal((await login).status(), 200);
  authenticated = true;
  report.loginHttp = 200;
  const me = await (await status('/api/admin/auth/me')).json();
  assert.equal(me.role, 'Owner');
  assert(me.csrfToken);
  const cookies = await context.cookies();
  assert(cookies.some(cookie => /owner/i.test(cookie.name) && cookie.secure && cookie.httpOnly && cookie.sameSite === 'Strict'));
  report.cookie = { secure: true, httpOnly: true, sameSite: 'Strict' };
  assert.equal((await api.post(origin + '/api/admin/auth/logout')).status(), 400);
  report.missingCsrfHttp = 400;
  for (const path of ['/api/admin/dashboard', '/api/admin/orders/operational?Page=1', '/api/admin/products',
    '/api/admin/customers', '/api/admin/operation/settings', ...['summary', 'revenue', 'payment-methods', 'transactions', 'audit', 'revenue-by-category'].map(part => '/api/admin/finance/' + part + '?period=30d&page=1')]) {
    const response = await status(path);
    if (path.includes('/orders/operational')) report.operationalOrders = (await response.json()).total;
    if (path === '/api/admin/dashboard') {
      const data = await response.json();
      report.dashboard = { today: data.today, orderCounts: data.orderCounts, openOrders: data.openOrders };
    }
    if (path.includes('/finance/summary')) report.finance = await response.json();
    if (path.includes('/finance/revenue?')) report.revenue = await response.json();
    if (path.includes('/finance/payment-methods?')) report.paymentMethods = await response.json();
    if (path.includes('/finance/transactions')) report.transactions = (await response.json()).items.map(row => ({
      orderId: row.orderId, amount: row.amount, status: row.status, approvedAt: row.approvedAt,
    }));
    if (path.includes('/finance/revenue-by-category')) report.categories = await response.json();
  }
  report.financePeriod = '30d';
  assert(Math.abs(report.revenue.reduce((sum, point) => sum + point.revenue, 0) - report.finance.grossRevenue) < 0.01);
  assert(Math.abs(report.paymentMethods.reduce((sum, method) => sum + method.revenue, 0) - report.finance.grossRevenue) < 0.01);
  assert(Math.abs(report.categories.grossRevenue - report.finance.grossRevenue) < 0.01);
  const revenueCard = page.getByRole('heading', { name: 'Receita de hoje', exact: true }).locator('xpath=ancestor::article[1]');
  const formattedRevenue = report.dashboard.today.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await expect.poll(() => revenueCard.locator('.owner-display').textContent().then(text => text.replace(/\s/g, ''))).toContain(formattedRevenue.replace(/\s/g, ''));
  await revenueCard.screenshot({ path: join(evidenceDirectory, `revenue-${portfolio ? 'postgres' : 'sqlite'}.png`) });
  const sidebar = page.getByRole('complementary', { name: 'Navegação administrativa' });
  for (const label of ['Visão Geral', 'Pedidos', 'Cozinha', 'Expedição', 'Entregas', 'Cardápio', 'Estoque', 'Clientes', 'Financeiro', 'Relatórios', 'Equipe', 'Configurações']) {
    const button = sidebar.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Carregando dados…', { exact: true })).toHaveCount(0);
    report.modules.push(label);
  }
  await page.goto(origin + '/menu?forceOpen=true');
  await page.getByRole('button', { name: /^Ver cardápio completo$/i }).click();
  const menu = page.getByRole('dialog', { name: /Escolha seu favorito/i });
  await expect(menu.getByRole('tabpanel').locator('article')).toHaveCount(6);
  await menu.getByRole('button', { name: 'Adicionar The Classic', exact: true }).click();
  await expect(menu.getByRole('group', { name: 'Quantidade de The Classic', exact: true }).locator('output')).toHaveText('1');
  await expect(menu.getByRole('button', { name: 'Ver sacola', exact: true })).toBeVisible();
  report.localCart = 'One item; no order or payment submitted.';
  const session = await (await status('/api/admin/auth/me')).json();
  assert.equal((await api.post(origin + '/api/admin/auth/logout', { headers: { 'X-CSRF-TOKEN': session.csrfToken } })).status(), 204);
  authenticated = false;
  await status('/api/admin/dashboard', 401);
  assert.deepEqual(report.serverErrors, []);
  report.logoutHttp = 204;
  await writeFile(join(evidenceDirectory, `browser-${portfolio ? 'postgres' : 'sqlite'}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ origin, provider: report.provider, modules: report.modules.length, login: report.loginHttp, csrf: report.missingCsrfHttp, activeProducts: activeProducts.length, serverErrors: 0 }));
  await context.close();
} finally {
  if (authenticated) {
    try {
      const response = await context.request.get(origin + '/api/admin/auth/me');
      if (response.ok()) {
        const session = await response.json();
        const logout = await context.request.post(origin + '/api/admin/auth/logout', { headers: { 'X-CSRF-TOKEN': session.csrfToken } });
        assert.equal(logout.status(), 204, 'Failed to revoke the test session after a failed assertion.');
      }
    } catch {
      console.error('Não foi possível confirmar a revogação da sessão do ensaio após a falha.');
      process.exitCode = 1;
    }
  }
  await browser.close();
}
