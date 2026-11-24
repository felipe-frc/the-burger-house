import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.BURGER_PREVIEW_ORIGIN;
const secret = process.env.BURGER_PREVIEW_ACCESS_TOKEN;
const password = process.env.HOMOLOGATION_OWNER_PASSWORD;
if (!origin || !/^https:\/\/the-burger-house-[a-z0-9]+-felipe-frcs-projects\.vercel\.app$/.test(origin) || !secret || !password)
  throw new Error('Explicit Preview and private test credentials are required.');
const headers = { 'x-vercel-protection-bypass': secret, 'x-vercel-skip-toolbar': '1' };
const report = { origin, checkedAt: new Date().toISOString(), businessWrites: 0, status: 'running' };
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request();
    const target = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
        !(target.origin === origin && request.method() === 'POST' && /^\/api\/admin\/auth\/(login|logout)$/.test(target.pathname)))
      return route.abort('blockedbyclient');
    return target.origin === origin ? route.continue({ headers: { ...request.headers(), ...headers } }) : route.continue();
  });
  const identityResponse = await context.request.get(origin + '/api/homologation/info', { headers });
  const identity = await identityResponse.json();
  if (identityResponse.status() !== 200 || identity.environment !== 'Homologation' || identity.isolated !== true || identity.sandbox !== true)
    throw new Error('Isolated API not confirmed.');
  const page = await context.newPage();
  await page.goto(origin + '/admin/');
  await page.getByLabel('E-mail', { exact: true }).fill('owner.homologation@example.invalid');
  try { await page.getByLabel('Senha', { exact: true }).fill(password); }
  catch { throw new Error('Private test Owner input unavailable.'); }
  const loginWait = page.waitForResponse(response => response.url().endsWith('/api/admin/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Entrar/ }).click();
  report.loginHttp = (await loginWait).status();
  await page.waitForURL('**/admin/dashboard');
  await page.getByRole('button', { name: 'Cardápio', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Editar / })).toHaveCount(15);
  await page.getByRole('button', { name: 'Editar The Classic', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Editar Produto do Cardápio' });
  await expect(form.getByLabel('Descrição do produto', { exact: true })).toHaveCount(1);
  await expect(form.getByLabel('Descrição em inglês', { exact: true })).toHaveCount(1);
  report.productCount = 15;
  report.accessibleDescriptionLabels = true;
  await page.keyboard.press('Escape');
  const logoutWait = page.waitForResponse(response => response.url().endsWith('/api/admin/auth/logout') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Menu do proprietário' }).click();
  await page.getByRole('menuitem', { name: 'Sair', exact: true }).click();
  report.logoutHttp = (await logoutWait).status();
  report.anonymousAfterLogout = (await context.request.get(origin + '/api/admin/auth/me', { headers })).status();
  if (report.loginHttp !== 200 || report.logoutHttp !== 204 || report.anonymousAfterLogout !== 401) throw new Error('Owner session lifecycle failed.');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; }
finally { await browser.close(); }
await mkdir('test-results/acceptance', { recursive: true });
await writeFile('test-results/acceptance/final-owner-check.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
