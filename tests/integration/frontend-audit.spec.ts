import type { Page } from '@playwright/test';
import { expect, test } from '../e2e/owner-react-fixture.js';
const products = [{ code: 'burger-praiano', name: 'O Praiano', price: 51.90, isActive: true, category: 'menu' }];

async function isolate(page: Page, origin: string) {
  await page.addInitScript(() => localStorage.setItem('burger-house-privacy-consent-v1', JSON.stringify({version:1,updatedAt:Date.now(),maps:true,analytics:false})));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.abort();
    if (url.pathname === '/api/products/extras') return route.fulfill({ json: [] });
    if (url.pathname === '/api/products') return route.fulfill({ json: products });
    if (url.hostname === 'api.maptiler.com') return route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    return route.abort();
  });
}

for (const [width, height] of [[430, 932], [1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [820, 1180], [768, 1024], [414, 896], [390, 844], [375, 667], [360, 640], [320, 568]]) {
  test(`menu, nutrition, purchase and keyboard at ${width}×${height}`, async ({ browser, ownerOrigin: origin }, info) => {
    test.skip(info.project.name === 'mobile', 'The viewport matrix sets its own desktop and touch contexts.');
    const page = await browser.newPage({ viewport: { width, height }, isMobile: width <= 540, hasTouch: width <= 540, reducedMotion: 'reduce' });
    try {
      await isolate(page, origin);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.url().startsWith(origin) && response.status() >= 400) errors.push(new URL(response.url()).pathname);
      });
      await page.goto(origin);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('.tbh-navbar')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const styles=await page.locator('.tbh-navbar, [data-tbh-marquee], .tbh-button, .tbh-footer-loyalty, .tbh-footer-order, .accordion-gallery').evaluateAll(elements=>elements.map(el=>{
        const css=getComputedStyle(el);return {classes:el.className,styles:Object.fromEntries(['display','height','minHeight','backgroundColor','color','padding','borderRadius','borderWidth','boxShadow','fontFamily','fontSize','fontWeight','lineHeight','animationTimingFunction'].map(key=>[key,css[key]]))};
      }));
      await info.attach('computed-styles',{body:JSON.stringify({width,height,styles}),contentType:'application/json'});
      if(width===1440||width===390)await info.attach('home-'+width,{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
      // Wait for the interactive shell, since the heading now renders in the initial HTML.
      await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).toBeAttached();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      const menuTrigger = page.getByRole('button', { name: /^Ver cardápio completo$/i });
      await menuTrigger.click();
      const modal = page.getByRole('dialog', { name: /Escolha seu favorito/i });
      await expect(modal.getByRole('button', { name: 'Fechar cardápio' })).toBeFocused();
      for (const [name, count] of [[/Smash burgers/i, 6], [/Acompanhamentos/i, 3], [/Bebidas/i, 6]] as const) {
        const tab = modal.getByRole('tab', { name });
        await tab.click();
        const cards = modal.getByRole('tabpanel', { name }).locator('article');
        await expect(cards).toHaveCount(count);
        for (const image of await cards.locator('img').all()) {
          await image.scrollIntoViewIfNeeded();
          await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
          expect(await image.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/-(384|768)\.webp$/);
        }
      }
      const sides = modal.getByRole('tab', { name: /Acompanhamentos/i });
      if (width <= 540) await sides.tap();
      else await sides.click();
      if (width === 320) {
        await expect(sides).toBeVisible();
        expect(await sides.evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(await sides.evaluate(el => el.clientWidth + 1));
      }
      await modal.getByRole('tabpanel', { name: /Acompanhamentos/i }).locator('.tbh-fullmenu-info').first().click();
      await expect(modal.getByRole('tab', { name: 'DESCRIÇÃO' })).toBeVisible();
      await expect(modal.getByRole('tab', { name: 'INGREDIENTES', exact: true })).toHaveCount(0);
      await modal.getByRole('tab', { name: /Smash burgers/i }).click();
      const detailsTrigger = modal.locator('[data-menu-product="o-praiano"] .tbh-fullmenu-info');
      await detailsTrigger.click();
      await modal.locator('.tbh-fullmenu-back').click();
      await expect(detailsTrigger).toBeFocused();
      await detailsTrigger.click();
      await expect(modal.locator('.tbh-fullmenu-back')).toBeFocused();
      const infoTab = modal.getByRole('tab', { name: 'INGREDIENTES' });
      const nutritionTab = modal.getByRole('tab', { name: 'INFORMAÇÕES NUTRICIONAIS' });
      await infoTab.focus();
      await page.keyboard.press('ArrowRight');
      await expect(nutritionTab).toBeFocused();
      await expect(nutritionTab).toHaveAttribute('aria-selected', 'true');
      await expect(infoTab).toHaveAttribute('tabindex', '-1');
      const panel = modal.getByRole('tabpanel', { name: 'INFORMAÇÕES NUTRICIONAIS' });
      await expect(panel).toHaveAttribute('id', (await nutritionTab.getAttribute('aria-controls'))!);
      await page.keyboard.press('Home');
      await expect(infoTab).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(nutritionTab).toBeFocused();
      await page.keyboard.press('Home');
      await expect(infoTab).toBeFocused();
      await page.keyboard.press('End');
      await expect(nutritionTab).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(panel).toBeFocused();
      const purchase = modal.locator('.tbh-fullmenu-detail-purchase');
      const cta = purchase.getByRole('button', { name: /Adicionar O Praiano/i });
      const initial = (await cta.boundingBox())!;
      expect(initial.y + initial.height).toBeLessThanOrEqual(height);
      const disclaimer = panel.getByText(/^Aviso:/);
      await disclaimer.scrollIntoViewIfNeeded();
      expect((await disclaimer.boundingBox())!.y).toBeLessThan(initial.y);
      expect((await cta.boundingBox())!.y).toBeCloseTo(initial.y, 0);
      expect(await panel.getByRole('table').evaluate(table => table.scrollWidth <= table.clientWidth + 1)).toBe(true);
      if ([1440, 768, 390, 320].includes(width)) await page.screenshot({ path: info.outputPath('nutrition.png') });
      if (width <= 540) await cta.tap();
      else await cta.click();
      await page.getByRole('button', { name: /^Ver sacola$/i }).click();
      const drawer = page.getByRole('dialog', { name: /Seu pedido/i });
      await expect(drawer.getByRole('heading', { name: /Sua sacola/i })).toBeVisible();
      await expect(page.locator('.tbh-fullmenu-dialog')).toHaveAttribute('inert', '');
      await drawer.getByRole('button', { name: /^Continuar$/i }).click();
      await expect(drawer.getByRole('heading', { name: /Como vamos preparar/i })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if ([1440, 390, 320].includes(width)) await page.screenshot({ path: info.outputPath('checkout.png') });
      await drawer.getByLabel(/^Nome completo/i).focus();
      const input = (await drawer.getByLabel(/^Nome completo/i).boundingBox())!;
      const footer = (await drawer.locator('.checkout-footer').boundingBox())!;
      expect(input.y + input.height).toBeLessThanOrEqual(footer.y + 1);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: /^Ver sacola$/i })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menuTrigger).toBeFocused();
      await page.getByRole('button',{name:'PROGRAMA DE FIDELIDADE'}).click();
      const loyalty=page.getByRole('dialog',{name:'EXPERIMENTE O CARTÃO FIDELIDADE'});
      await expect(loyalty).toBeVisible();
      expect(await loyalty.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
      await page.keyboard.press('Escape');
      if(width<=540){
        await page.getByRole('button',{name:'Abrir navegação',exact:true}).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
        await page.keyboard.press('Escape');
      }
      await page.goto(origin+'/privacy.html');
      await expect(page.getByRole('heading',{level:1})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
}

test('button motion respects reduced motion without changing the approved material', async ({ page, ownerOrigin: origin }) => {
  await isolate(page, origin);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin);
  const button = page.getByRole('button', { name: /^Ver cardápio completo$/i });
  const supportsHover = await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  if (supportsHover) {
    await button.hover();
    await expect(button).toHaveCSS('transform', /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expect(button).toHaveCSS('background-color', 'rgb(255, 233, 106)');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(button).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 2)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(button).toHaveCSS('transform', /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  } else {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    await button.focus();
    await expect(button).toHaveCSS('outline-color', 'rgb(40, 100, 240)');
    await expect(button).toHaveCSS('outline-offset', '5px');
    await button.hover();
    await expect(button).toHaveCSS('background-color', 'rgb(255, 220, 50)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(button).toHaveCSS('transform', /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  }
});

test('English pricing, visible Hero fallback, map failure and direct privacy skip', async ({ page, ownerOrigin: origin }, info) => {
  await isolate(page, origin);
  await page.addInitScript(() => localStorage.setItem('burgerShop:language', 'en-US'));
  await page.goto(origin);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.locator('.tbh-nav-language-trigger img[src="/assets/flags/us.svg"]')).toHaveCount(1);
  await expect(page.locator('#home .tbh-hero-menu-cta')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.tbh-mascot-poster')).toBeVisible();
  await expect(page.locator('.tbh-hero-mascot video')).not.toHaveAttribute('src', /./);
  await expect(page.locator('[data-product="o-praiano"] .tbh-showcase-price')).toHaveText('R$51.90');
  await page.getByRole('button', { name: /^View full menu$/i }).click();
  const card = page.locator('[data-menu-product="o-praiano"]');
  await expect(card.locator('.tbh-fullmenu-product-price')).toHaveText('R$51.90');
  await card.getByRole('button', { name: /^Add O Praiano$/i }).click();
  await page.getByRole('button', { name: /^View bag$/i }).click();
  await expect(page.locator('[data-cart-product="o-praiano"]')).toContainText('R$51.90');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: /Locations?/i }).filter({ visible: true }).first().click();
  const locationTitle = page.locator('#locations h2');
  await expect(locationTitle).toBeFocused();
  await expect.poll(async () => (await locationTitle.boundingBox())!.y).toBeGreaterThanOrEqual(
    await page.locator('.tbh-navbar').evaluate(header => header.getBoundingClientRect().bottom),
  );
  await expect(page.getByRole('alert')).toContainText('The map is unavailable');
  await expect(page.locator('.tbh-location-map-canvas')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: /zoom in|zoom out/i })).toHaveCount(0);
  await expect(page.getByText('Illustrative location')).toBeVisible();
  if (info.project.name === 'desktop') await page.screenshot({ path: info.outputPath('map-fallback.png') });
  const careers = page.getByRole('button', { name: 'I want to join' });
  await careers.click();
  const careersDialog = page.locator('.tbh-careers-dialog');
  await expect(careersDialog.getByRole('button', { name: 'Close application' })).toBeFocused();
  await expect(careersDialog.getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(careers).toBeFocused();
  await page.goto(`${origin}/privacy.html`);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('gallery reveal leaves most of each photo visible and clears after entry', async ({ page, ownerOrigin: origin }, info) => {
  test.skip(info.project.name !== 'desktop', 'The motion sample uses the desktop gallery composition.');
  await isolate(page, origin);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin);
  const photo = page.locator('.ag-photo-reveal').nth(3);
  await expect(photo).toHaveCSS('clip-path', /^inset\(9% 0%\)/);
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toHaveCSS('clip-path', 'none');
  await page.screenshot({ path: info.outputPath('gallery.png') });
});

test('map success enables zoom and the labelled pin with a local style fixture', async ({ page, browserName, ownerOrigin: origin }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'desktop', 'The fixture requires headless WebGL.');
  await isolate(page, origin);
  let styles = 0;
  await page.route('https://api.maptiler.com/maps/base-v4/style.json?*', route => {
    styles++;
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { version: 8, sources: {}, layers: [{ id: 'test-background', type: 'background', paint: { 'background-color': '#F5F3EE' } }] },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.locator('#locations').scrollIntoViewIfNeeded();
  const map = page.getByRole('region', { name: /mapa ilustrativo/i });
  await expect(map).toBeVisible();
  expect(styles).toBe(1);
  const zoomIn = map.getByRole('button', { name: 'Zoom in' });
  const zoomOut = map.getByRole('button', { name: 'Zoom out' });
  for (let i = 0; i < 5; i++) await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  await zoomOut.click();
  await expect(zoomIn).toBeEnabled();
  await map.getByRole('button', { name: /Ver ponto ilustrativo/i }).click();
  await expect(map.getByText('Balneário Camboriú — SC')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Hero title and poster render in the initial document without JavaScript', async ({ browser, ownerOrigin: origin }) => {
  const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    await isolate(page, origin);
    await page.goto(origin);
    await expect(page.getByRole('heading', { level: 1, name: 'GOOD FOOD GOOD TIMES', exact: true })).toBeVisible();
    await expect(page.locator('.tbh-mascot-poster')).toBeVisible();
    expect(await page.locator('.tbh-mascot-poster').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(516);
  } finally { await page.close(); }
});

test('loyalty card keeps the local demo and labels test stamps clearly', async ({ page, ownerOrigin: origin }) => {
  await isolate(page, origin);
  await page.goto(origin);
  const opener = page.getByRole('button', { name: 'PROGRAMA DE FIDELIDADE' });
  await opener.click();
  const card = page.getByRole('dialog', { name: 'EXPERIMENTE O CARTÃO FIDELIDADE' });
  await expect(card.getByText(/não geram recompensas/i)).toBeVisible();
  const stamp = card.getByRole('button', { name: /Carimbo de teste/i });
  for (let i = 0; i < 3; i++) await stamp.click();
  await expect(card.getByText('Cartão completo!')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('keyboard modal and nutrition remain usable at a 200% equivalent reflow', async ({ page, ownerOrigin: origin }) => {
  await isolate(page, origin);
  await page.setViewportSize({ width: 640, height: 450 });
  await page.goto(origin);
  await page.getByRole('button', { name: /^Ver cardápio completo$/i }).click();
  const modal = page.getByRole('dialog');
  const close = modal.getByRole('button', { name: /Fechar cardápio/i });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).not.toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await modal.locator('[data-menu-product="o-praiano"] .tbh-fullmenu-info').click();
  await modal.getByRole('tab', { name: /Informações nutricionais/i }).click();
  await expect(modal.getByRole('table')).toHaveAccessibleName(/porção/i);
  const purchase = modal.locator('.tbh-fullmenu-detail-purchase button');
  await expect(purchase).toBeInViewport();
  expect((await purchase.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(640);
});


test('shared showcase buttons preserve approved disabled, hover and focus tokens',async({page,ownerOrigin:origin})=>{
  await isolate(page,origin);await page.goto(origin);await page.waitForLoadState('networkidle');
  const supportsHover=await page.evaluate(()=>window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  const enabled=page.locator('[data-product="o-praiano"] .tbh-showcase-add');
  await expect(enabled).toBeEnabled();await expect(enabled).toHaveCSS('border-top-width','2px');
  await enabled.focus();await expect(enabled).toHaveCSS('outline-offset','5px');
  await expect(enabled).toHaveCSS('outline-color','rgb(40, 100, 240)');
  await enabled.hover();
  if (supportsHover) {
    await expect(enabled).toHaveCSS('background-color','rgb(255, 233, 106)');
  } else {
    expect((await enabled.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    await expect(enabled).toHaveCSS('background-color','rgb(255, 220, 50)');
  }
  const disabled=page.locator('.tbh-showcase-add:disabled').first();
  await expect(disabled).toHaveCSS('background-color','rgb(222, 219, 213)');
  await expect(disabled).toHaveCSS('color','rgb(85, 81, 75)');
  await expect(disabled).toHaveCSS('border-top-width','2px');
});
