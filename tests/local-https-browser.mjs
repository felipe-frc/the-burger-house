// Read-only API boundary: browser profiles are disposable; no order/payment mutation is permitted.
import assert from 'node:assert/strict';
import { chromium, firefox, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const evidence=resolve('test-results/final-v1'); await mkdir(evidence,{recursive:true});
const browsers=[
  ['Chrome',chromium,{channel:'chrome'}], ['Edge',chromium,{channel:'msedge'}],
  ['Brave',chromium,{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'}],
  ['Firefox',firefox,{firefoxUserPrefs:{'security.enterprise_roots.enabled':true}}],
];
const results=[];
for(const [name,type,options] of browsers){
  let context;
  const profile=await mkdtemp(join(evidence,'browser-'+name.toLowerCase()+'-'));
  const start=async()=>{
    const c=await type.launchPersistentContext(profile,{...options,headless:true,viewport:{width:1440,height:1000}});
    c.setDefaultTimeout(8000); c.setDefaultNavigationTimeout(30000);
    await c.route('**/*',route=>{
      const u=new URL(route.request().url());
      return ['https://127.0.0.1:55485','https://localhost:55485'].includes(u.origin)&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort();
    });
    return c;
  };
  try{
    console.log(name+': strict TLS and browser restart');
    context=await start(); const page=context.pages()[0]??await context.newPage();
    await page.goto('https://127.0.0.1:55485/menu?forceOpen=true');
    assert.equal(await page.evaluate(()=>window.isSecureContext),true);
    await expect(page.getByRole('button',{name:/^Ver cardápio completo$/i})).toBeVisible();
    await page.getByRole('button',{name:/^Ver cardápio completo$/i}).click();
    await page.getByRole('dialog',{name:/Escolha seu favorito/i}).getByRole('button',{name:/^Adicionar The Classic$/i}).click();
    await page.getByRole('button',{name:/^Fechar cardápio$/i}).click();
    await expect(page.getByRole('button',{name:/Ver sacola de pedidos, 1 itens/})).toHaveCount(1);
    await context.close(); context=await start();
    const reopened=context.pages()[0]??await context.newPage();
    await reopened.goto('https://127.0.0.1:55485/menu?forceOpen=true');
    await expect(reopened.getByRole('button',{name:/Ver sacola de pedidos, 0 itens/})).toHaveCount(1);
    await reopened.goto('https://localhost:55485/menu');
    assert.equal(await reopened.evaluate(()=>window.isSecureContext),true);
    await reopened.goto('https://127.0.0.1:55485/admin/');
    await expect(reopened.getByLabel('E-mail',{exact:true})).toBeVisible();
    results.push({browser:name,version:context.browser()?.version()??'persistent browser',https127:true,httpsLocalhost:true,ownerLoginPage:true,cartBeforeClose:1,cartAfterBrowserRestart:0,tlsErrorsIgnored:false});
    console.log(name+': passed');
  }catch(error){results.push({browser:name,failed:true,error: error instanceof Error?error.message.split('\n')[0]:'Browser validation failed'});}
  finally{await context?.close();}
}
await writeFile(join(evidence,'https-browsers.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.failed))process.exitCode=1;
