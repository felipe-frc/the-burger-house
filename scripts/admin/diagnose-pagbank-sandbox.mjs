import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const base = 'https://sandbox.api.pagseguro.com';
const root = (await readFile('test-results/acceptance/homologation-path.txt', 'utf8')).trim();
const allowed = path.resolve('test-results/acceptance') + path.sep;
if (!path.resolve(root).startsWith(allowed) || !path.basename(root).startsWith('burgerhouse-homologation-')) throw Error('Invalid isolated root.');
const db = new DatabaseSync(path.join(root, 'burgerhouse.homologation.db'), { readOnly: true });
const payments = db.prepare('SELECT Id, OrderId, Amount, Status, ExternalCheckoutId FROM Payments ORDER BY Id').all();
db.close();
const token = process.env.PAGBANK_SANDBOX_DIAGNOSTIC_TOKEN;
if (!token) throw Error('Existing sandbox credential required privately.');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
const report = { checkedAt: new Date().toISOString(), environment: 'sandbox', productionTouched: false, sessions: [] };
const correlation = h => Object.fromEntries(['x-request-id', 'x-correlation-id', 'request-id', 'correlation-id', 'traceparent', 'x-amzn-trace-id'].filter(k => h.get(k)).map(k => [k,h.get(k)]));
const callback = value => { try { const u = new URL(value); return {origin:u.origin,path:u.pathname}; } catch {return null;} };
for (const p of payments) {
  if (!/^CHEC_[a-z0-9-]+$/i.test(p.ExternalCheckoutId ?? '')) continue;
  const response = await fetch(`${base}/checkouts/${encodeURIComponent(p.ExternalCheckoutId)}`, { headers, redirect: 'error' });
  if (response.status !== 200) { report.sessions.push({paymentId:p.Id,checkoutId:p.ExternalCheckoutId,httpStatus:response.status,correlation:correlation(response.headers)}); continue; }
  const c = await response.json();
  report.sessions.push({ paymentId:p.Id,orderId:p.OrderId,amount:p.Amount,localStatus:p.Status,httpStatus:response.status,
    checkoutId:c.id,referenceId:c.reference_id,status:c.status,createdAt:c.created_at,expirationDate:c.expiration_date,
    customerModifiable:c.customer_modifiable,customerShape:{namePresent:!!c.customer?.name,emailPresent:!!c.customer?.email,taxIdPresent:!!c.customer?.tax_id,phonePresent:!!c.customer?.phone},
    items:c.items?.map(i=>({referenceId:i.reference_id,quantity:i.quantity,unitAmount:i.unit_amount})),
    paymentMethods:c.payment_methods?.map(m=>({type:m.type,brands:m.brands})),paymentMethodsConfigs:c.payment_methods_configs,
    redirect:callback(c.redirect_url),return:callback(c.return_url),notifications:c.notification_urls?.map(callback),paymentNotifications:c.payment_notification_urls?.map(callback),
    payHost:c.links?.filter(l=>l.rel==='PAY').map(l=>new URL(l.href).host),correlation:correlation(response.headers),
    paymentStatus:c.payment_status,chargeCount:Array.isArray(c.charges)?c.charges.length:null,
  });
}
report.callbacks=[];
for(const url of ['https://bon-terrorist-belong-nato.trycloudflare.com/api/homologation/info','https://the-burger-house-3mqfd8mec-felipe-frcs-projects.vercel.app/menu']){
 try{
  const response=await fetch(url,{method:'GET',redirect:'manual'});
  report.callbacks.push({endpoint:url,status:response.status});
 }catch(error){report.callbacks.push({endpoint:url,status:null,networkError:error.cause?.code==='ENOTFOUND'?'ENOTFOUND':'network-failure'});}
}
await mkdir('test-results/acceptance/pagbank-422', {recursive:true});
await writeFile('test-results/acceptance/pagbank-422/session-inspection.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
