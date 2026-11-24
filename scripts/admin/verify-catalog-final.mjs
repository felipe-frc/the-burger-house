import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const folder='test-results/catalog-final';
const manifest=JSON.parse(await readFile(folder+'/manifest.json','utf8'));
const cleanup=JSON.parse(await readFile(folder+'/local-cleanup.json','utf8'));
const origin=JSON.parse(await readFile('test-results/acceptance/pix-approved/tunnel-restored.json','utf8')).origin;
if(!/^https:\/\/[a-z-]+\.trycloudflare\.com$/.test(origin)||!process.env.HOMOLOGATION_OWNER_PASSWORD)throw Error('Explicit isolated origin and private Owner required.');
const expected=cleanup.after.products;
const report={checkedAt:new Date().toISOString(),origin,productionTouched:false,checks:[],newPaymentsSubmitted:0};
const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const api=async path=>context.request.get(origin+path);
 const identity=await(await api('/api/homologation/info')).json();
 if(identity.environment!=='Homologation'||!identity.isolated||!identity.sandbox)throw Error('Isolated API required.');
 const publicResponse=await api('/api/products');const products=await publicResponse.json();
 if(products.length!==15||JSON.stringify(products.map(p=>p.code).sort())!==JSON.stringify([...manifest.keepCodes].sort()))throw Error('Definitive public identities mismatch.');
 report.checks.push({name:'public-api-exact-15-codes',http:publicResponse.status(),count:products.length});
 report.unauthorizedAdminHttp=(await api('/api/admin/products')).status();if(report.unauthorizedAdminHttp!==401)throw Error('Anonymous admin access.');
 const page=await context.newPage();await page.goto(origin+'/admin/');
 await page.getByLabel('E-mail',{exact:true}).fill('owner.homologation@example.invalid');await page.getByLabel('Senha',{exact:true}).fill(process.env.HOMOLOGATION_OWNER_PASSWORD);
 const login=page.waitForResponse(r=>r.url().endsWith('/api/admin/auth/login'));await page.getByRole('button',{name:'Entrar',exact:true}).click();report.loginHttp=(await login).status();
 await page.waitForURL('**/admin/dashboard');
 const adminResponse=await api('/api/admin/products');const admin=await adminResponse.json();
 if(admin.length!==15||JSON.stringify(admin.map(p=>p.id).sort((a,b)=>a-b))!==JSON.stringify(expected.map(p=>p.id).sort((a,b)=>a-b)))throw Error('Admin identity mismatch.');
 for(const p of expected)if(!admin.some(a=>a.id===p.id&&a.name===p.name))throw Error('Admin product mismatch.');
 await page.getByRole('button',{name:'Cardápio',exact:true}).click();
 await expect(page.getByRole('button',{name:/^Editar /})).toHaveCount(15);
 for (const product of expected) {
   await expect(page.getByRole('switch',{name:'Alternar disponibilidade de '+product.name,exact:true})).toBeEnabled();
   await page.getByRole('button',{name:'Editar '+product.name,exact:true}).click();
   const dialog = page.getByRole('dialog',{name:'Editar Produto do Cardápio'});
   for (const label of ['Nome do Item *','Descrição do produto','Preço Venda (R$) *','Nome em inglês','Descrição em inglês','Categoria','Ordem Exibição'])
     await expect(dialog.getByLabel(label,{exact:true})).toBeEnabled();
   await page.keyboard.press('Escape');
 }
 await page.screenshot({path:folder+'/admin-products-15.png',fullPage:true});
 report.checks.push({name:'admin-api-and-edit-forms-exact-15',http:adminResponse.status(),count:admin.length,keptIdCodeMapping:expected.map(p=>({id:p.id,code:p.code}))});
 report.paidOrders=[];
 for(const id of[4,5]){const d=await(await api('/api/admin/orders/'+id)).json();report.paidOrders.push({id,status:d.order.status,paymentStatus:d.order.paymentStatus,method:d.order.paymentMethod,total:d.order.total});if(d.order.paymentStatus!=='Approved'||d.order.total!==34.9)throw Error('Paid history missing.');}
 report.missingCsrfHttp=(await context.request.patch(origin+'/api/admin/products/'+expected[0].id,{data:{}})).status();if(report.missingCsrfHttp!==400)throw Error('CSRF guard failed.');
 const logout=page.waitForResponse(r=>r.url().endsWith('/api/admin/auth/logout'));
 await page.getByRole('button',{name:'Menu do proprietário'}).click();
 await page.getByRole('menuitem',{name:'Sair',exact:true}).click();report.logoutHttp=(await logout).status();
 if((await api('/api/admin/products')).status()!==401)throw Error('Logout not enforced.');
 await page.goto(origin+'/menu',{waitUntil:'networkidle'});
 for(const[label,category,count]of[['Burgers','menu',6],['Acompanhamentos','sides',3],['Bebidas','drinks',6]]){
  await page.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('article')).toHaveCount(count);
  for(const product of products.filter(p=>p.category===category)){
   const card=page.locator('article').filter({has:page.getByRole('heading',{name:product.name,exact:true})});await expect(card).toHaveCount(1);
   const image=card.locator('img');await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
  }
  report.checks.push({name:'final-catalog-images-'+category,count});
 }
 await page.getByRole('button',{name:'Burgers',exact:true}).click();await page.getByRole('button',{name:'Adicionar ao carrinho: The Classic',exact:true}).click();await page.getByRole('button',{name:/Abrir carrinho com 1/}).click();
 await page.getByRole('button',{name:'Aumentar The Classic',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('69,80');await page.getByRole('button',{name:'Diminuir The Classic',exact:true}).click();
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:/Retirada Sem taxa/}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByLabel('Nome completo',{exact:true}).fill('Cliente Homologacao');await page.getByLabel('Celular com DDD').fill('11999990000');await page.getByLabel('E-mail',{exact:true}).fill('homologacao@example.com');await page.getByLabel('CPF',{exact:true}).fill('52998224725');
 await page.getByRole('button',{name:'Revisar pedido',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('34,90');
 const orderWait=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');const checkoutWait=page.waitForResponse(r=>/\/api\/checkout\/\d+$/.test(r.url())&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Ir para pagamento',exact:true}).click();const orderResponse=await orderWait;const order=await orderResponse.json();const checkoutResponse=await checkoutWait;const checkout=await checkoutResponse.json();
 if(orderResponse.status()!==201||checkoutResponse.status()!==200||order.total!==34.9||new URL(checkout.checkoutUrl).host!=='pagamento.sandbox.pagbank.com.br')throw Error('Checkout regression.');
 report.orderCreation={http:201,orderId:order.orderId,total:order.total};report.checkout={http:200,paymentId:checkout.paymentId,providerHost:'pagamento.sandbox.pagbank.com.br',paymentSubmitted:false};
 report.status='passed';
}catch(error){report.status='failed';report.failureType=error.name;report.failure='Final catalog regression stopped; private inputs omitted.';process.exitCode=1;}
finally{await browser.close();await writeFile(folder+'/hosted-regression.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
