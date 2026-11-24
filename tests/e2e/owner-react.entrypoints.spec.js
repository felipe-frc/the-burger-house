import { test, expect } from './owner-react-fixture.js';
import { fixture } from './owner-contract-fixture.js';
import { assertUsable } from './owner-layout-assertions.js';
for(const width of [320,360,375,390,414,768,820,1024,1280,1440,1920]) for(const dark of [false,true]) {
 test(`Login and courier ${width}px ${dark?'dark':'light'}`,async({page},info)=>{
  const evidence=[];await page.setViewportSize({width,height:width<768?640:900});
  await page.addInitScript(dark=>localStorage.setItem('tbh-owner-theme',dark?'dark':'light'),dark);
  await fixture(page);await page.goto('/admin/');await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();
  await assertUsable(page,'Login Owner',evidence);await page.getByLabel('E-mail',{exact:true}).focus();
  await page.keyboard.press('Tab');await expect(page.getByLabel('Senha',{exact:true})).toBeFocused();
  await page.goto('/admin/courier/108#'+ 'a'.repeat(64));
  await expect(page.getByRole('heading',{name:'Localização da entrega #108'})).toBeVisible();
  await assertUsable(page,'Convite do entregador',evidence);
  await page.getByRole('button',{name:'Compartilhar minha localização'}).focus();
  expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe('BUTTON');
  await info.attach('screen-viewport-matrix',{body:JSON.stringify({width,dark,cases:evidence}),contentType:'application/json'});
 });
}
