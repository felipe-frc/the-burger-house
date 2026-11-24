import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../e2e/owner-react-fixture.js';

const widths = [320, 375, 390, 430, 768, 1024, 1366, 1440, 1920];
const legal = ['/privacy.html', '/terms.html', '/cancellation.html', '/rights.html'];

for (const theme of ['light', 'dark'] as const) {
  test(`legal pages, consent and responsive widths in ${theme}`, async ({ page, ownerOrigin }, info) => {
    test.setTimeout(120000);
    test.skip(info.project.name !== 'desktop', 'Explicit viewport matrix.');
    await page.emulateMedia({ colorScheme: theme });
    await page.route('**/api/privacy/config', route => route.fulfill({ json: { requestsEnabled: false, draft: true } }));
    await page.route('**/api/products', route => route.fulfill({ json: [] }));
    for (const path of legal) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(ownerOrigin + path);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
        if (width === 390 || width === 1440) await page.screenshot({ path: info.outputPath(`${path.slice(1,-5)}-${theme}-${width}.png`), fullPage: true });
      }
      const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      expect(result.violations).toEqual([]);
    }
    await page.goto(ownerOrigin);
    const banner = page.getByRole('region', { name: /Suas escolhas de privacidade/ });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Personalizar', exact: true }).click();
    await expect(banner.getByRole('checkbox', { name: /Mapa externo/ })).not.toBeChecked();
    await expect(banner.getByRole('checkbox', { name: /Análise de audiência/ })).not.toBeChecked();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).include('.tbh-privacy-preferences').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      expect(result.violations).toEqual([]);
    }
    await page.screenshot({ path: info.outputPath(`consent-${theme}.png`) });
  });
}

test('consent prevents optional requests; maps revoke across tabs without clearing basket or auth', async ({ page, context, ownerOrigin }) => {
  let maps = 0; let analytics = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/google-analytics|googletagmanager|fonts\.google/.test(url.hostname)) { analytics++; return route.abort(); }
    if (url.hostname === 'api.maptiler.com') { maps++; return route.fulfill({ headers: { 'Access-Control-Allow-Origin':'*' }, json: { version:8, sources:{}, layers:[] } }); }
    if (url.pathname === '/api/products' || url.pathname === '/api/products/extras') return route.fulfill({ json:[] });
    return url.origin === ownerOrigin ? route.continue() : route.abort();
  });
  await page.goto(ownerOrigin);
  await page.evaluate(() => { localStorage.setItem('owner-theme','dark'); localStorage.setItem('privacy-test-essential-basket','preserved'); });
  await page.locator('#locations').scrollIntoViewIfNeeded();
  await expect(page.getByText(/Mapa ilustrativo bloqueado/)).toBeVisible();
  expect(maps).toBe(0); expect(analytics).toBe(0);
  const banner = page.getByRole('region', { name:'Suas escolhas de privacidade' });
  await banner.getByRole('button', { name:'Rejeitar opcionais' }).click();
  await page.reload();
  await expect(banner).toHaveCount(0);
  expect(maps).toBe(0); expect(analytics).toBe(0);
  const second = await context.newPage(); await second.goto(ownerOrigin);
  await page.evaluate(() => window.dispatchEvent(new Event('burger-house-open-privacy')));
  await banner.getByRole('checkbox', { name:/Mapa externo/ }).check();
  await banner.getByRole('button', { name:'Salvar escolhas' }).click();
  await page.locator('#locations').scrollIntoViewIfNeeded();
  await expect.poll(() => maps).toBeGreaterThan(0);
  expect(analytics).toBe(0); // No legitimate configured GA property.
  await second.evaluate(() => window.dispatchEvent(new Event('burger-house-open-privacy')));
  await second.getByRole('button', { name:'Rejeitar opcionais' }).click();
  await expect(page.getByText(/Mapa ilustrativo bloqueado/)).toBeVisible();
  await expect(page.locator('.tbh-location-map-canvas')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('owner-theme'))).toBe('dark');
  expect(await page.evaluate(() => localStorage.getItem('privacy-test-essential-basket'))).toBe('preserved');
  await second.close();
});

test('404 returns actual HTTP status and private paths reject indexing', async ({ page, ownerOrigin }) => {
  const response = await page.goto(ownerOrigin + '/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name:'Página não encontrada' })).toBeVisible();
  const robots = await page.request.get(ownerOrigin + '/robots.txt');
  expect(await robots.text()).toContain('Disallow: /');
  const owner = await page.request.get(ownerOrigin + '/admin/');
  expect(owner.headers()['x-robots-tag']).toContain('noindex');
  const api = await page.request.get(ownerOrigin + '/api/privacy/requests/00000000-0000-0000-0000-000000000001');
  expect(api.headers()['cache-control']).toContain('no-store');
});
