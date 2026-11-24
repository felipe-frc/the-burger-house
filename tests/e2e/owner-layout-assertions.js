import { expect } from '@playwright/test';
export async function assertUsable(page,label,evidence) {
  if(page.viewportSize().width===1440) await page.waitForLoadState('networkidle');
  await page.mouse.move(0,0);
  await page.evaluate(async()=>{
    const finite=document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity);
    await Promise.all(finite.map(animation=>animation.finished.catch(()=>{})));
  });
  const measured=await page.evaluate(()=>{
    const dialog=document.querySelector('[role=dialog][aria-modal=true]');
    const root=dialog??document.querySelector('main')??document.body;const rect=root.getBoundingClientRect();
    const fields=[...root.querySelectorAll('input,select,textarea,button')].filter(el=>
      !el.disabled&&el.getClientRects().length&&!el.closest('[hidden],[inert]'));
    return {overflow:document.documentElement.scrollWidth>innerWidth,
      dialogOutside:!!dialog&&(rect.left< -1||rect.right>innerWidth+1||rect.top< -1||rect.bottom>innerHeight+1),
      invalidWidths:fields.map(el=>el.matches('.sr-only') ? (el.labels?.[0]??el) : el).filter(el=>el.getBoundingClientRect().width<16).map(el=>({tag:el.tagName,classes:el.className,label:el.getAttribute('aria-label')}))};
  });
  expect(measured,label).toEqual({overflow:false,dialogOutside:false,invalidWidths:[]});
  const styles=await page.locator('.owner-navbar, .owner-sidebar, .owner-panel, .owner-input, .owner-button, .owner-display, .owner-label').evaluateAll(elements=>elements.slice(0,100).map(el=>{
   const css=getComputedStyle(el);return {classes:el.className,styles:Object.fromEntries(['display','backgroundColor','borderRadius','borderWidth','boxShadow','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','gap','maxWidth'].map(key=>[key,css[key]]))};
  }));
  evidence.push({screen:label,...measured,styles,result:'passed'});
}
