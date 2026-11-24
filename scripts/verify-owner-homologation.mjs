import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.OWNER_HOMOLOGATION_ORIGIN || 'https://localhost:4174';
const password = process.env.HOMOLOGATION_OWNER_PASSWORD;
assert.match(origin, /^https:\/\/localhost:\d+$/);
assert.ok(password, 'Use homologation.ps1 -Mode CheckLocalOwner.');
const browser = await chromium.launch({ executablePath: process.env.OWNER_TEST_CHROMIUM });
const evidence = { origin, checkedAt: new Date().toISOString(), modules: {} };
let step = 'verificação do ambiente isolado';
try {
  // Trust the local self-signed test certificate in this browser context only.
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  const api = context.request;
  const isolation = await api.get(origin + '/api/homologation/info');
  assert.equal(isolation.status(), 200);
  const info = await isolation.json();
  assert.equal(info.environment, 'Homologation');
  assert.equal(info.isolated, true);
  assert.equal(info.sandbox, true);
  assert.equal(info.database, 'burgerhouse.homologation.db');
  evidence.database = info.database;
  step = 'assets e proteção anônima';
  const html = await api.get(origin + '/admin/');
  assert.equal(html.status(), 200);
  const assets = [...new Set((await html.text()).match(/\/admin\/assets\/[^"\s]+\.(?:css|js)/g))];
  assert.ok(assets.some(path => path.endsWith('.js')) && assets.some(path => path.endsWith('.css')));
  for (const path of assets) {
    const response = await api.get(origin + path);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-type'], path.endsWith('.js') ? /javascript/ : /text\/css/);
  }
  assert.equal((await api.get(origin + '/admin/assets/missing.js')).status(), 404);
  assert.equal((await api.get(origin + '/api/admin/dashboard')).status(), 401);
  evidence.assets = assets.length;
  const storefront = await api.get(origin + '/');
  assert.equal(storefront.status(), 200);
  assert.match(storefront.headers()['content-type'], /text\/html/);
  assert.doesNotMatch(await storefront.text(), /\/admin\/assets\//);
  step = 'login Owner';
  const page = await context.newPage();
  await page.goto(origin + '/admin/');
  await page.getByLabel('E-mail', { exact: true }).fill('owner.homologation@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill(password);
  const login = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Entrar/ }).click();
  const loginStatus = (await login).status();
  step = 'resposta do login HTTP ' + loginStatus;
  assert.equal(loginStatus, 200);
  step = 'atributos do cookie Owner';
  const cookies = await context.cookies(origin + '/api/admin/auth/me');
  assert.ok(cookies.some(cookie => /owner/i.test(cookie.name) && cookie.httpOnly && cookie.secure && cookie.sameSite === 'Strict'));
  const me = await api.get(origin + '/api/admin/auth/me');
  step = 'sessão Owner HTTP ' + me.status();
  const session = await me.json();
  assert.equal(session.role, 'Owner');
  assert.ok(session.csrfToken);
  const missingCsrf = await api.post(origin + '/api/admin/auth/logout');
  step = 'proteção CSRF HTTP ' + missingCsrf.status();
  assert.equal(missingCsrf.status(), 400);
  evidence.auth = 'Login 200, cookie Secure/HttpOnly/Strict, sessão Owner, logout sem CSRF rejeitado com 400';
  step = 'recuperação da sessão e Visão Geral';
  await page.reload();
  await expect(page.getByText('Todos os canais · totais do servidor')).toBeVisible();
  evidence.modules.overview = 'Dashboard renderizado após recarregar sessão';
  for (const [name, label] of [['Financeiro', 'Auditoria financeira'], ['Relatórios', 'Receita bruta por data'], ['Cardápio', 'Gestão de Cardápio & Itens']]) {
    step = name;
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    evidence.modules[name] = 'Tela renderizada pela API sem interceptação';
  }
  const products = await api.get(origin + '/api/admin/products');
  assert.equal(products.status(), 200);
  evidence.products = (await products.json()).length;
  assert.ok(evidence.products > 0);
  for (const [name, route, label] of [
    ['Pedidos', '/orders?Page=1', 'Paginação de pedidos'],
    ['Cozinha', '/orders?Status=Received', 'Paginação de pedidos'],
    ['Expedição', '/orders?Status=ReadyForPickup', 'Paginação de pedidos'],
    ['Entregas', '/orders?Status=OutForDelivery', 'Paginação de pedidos'],
    ['Clientes', '/customers', 'Gestão de Clientes & Fidelidade'],
    ['Configurações', '/operation/settings', 'Configurações do Sistema'],
  ]) {
    step = name;
    const result = await api.get(origin + '/api/admin' + route);
    step = name + ' — API HTTP ' + result.status();
    assert.equal(result.status(), 200);
    step = name + ' — navegação';
    await page.getByRole('button', { name: new RegExp('^' + name + '(?:\\s+\\d+)?$') }).first().click();
    step = name + ' — tela';
    if (label === 'Paginação de pedidos') {
      await expect(page.getByRole('navigation', { name: label })).toBeVisible();
      await expect(page.getByText('Carregando dados…')).toHaveCount(0);
    } else {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    evidence.modules[name] = 'Leitura e navegação verificadas. Nenhuma mutação operacional executada.';
  }
  step = 'logout com CSRF';
  assert.equal((await api.post(origin + '/api/admin/auth/logout', { headers: { 'X-CSRF-TOKEN': session.csrfToken } })).status(), 204);
  assert.equal((await api.get(origin + '/api/admin/auth/me')).status(), 401);
  evidence.logout = '204 autenticado, sessão revogada (401)';
  await mkdir('test-results/acceptance', { recursive: true });
  await writeFile('test-results/acceptance/owner-local-https.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch {
  // Never include Playwright call logs from credential fields.
  console.error('Falha na verificação de homologação: ' + step);
  process.exitCode = 1;
} finally {
  await browser.close();
}
