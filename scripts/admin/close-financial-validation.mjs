import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=(await readFile('test-results/acceptance/homologation-path.txt','utf8')).trim();
if(!path.resolve(root).startsWith(path.resolve('test-results/acceptance')+path.sep)||!path.basename(root).startsWith('burgerhouse-homologation-'))throw Error('Isolation path required.');
const db=new DatabaseSync(path.join(root,'burgerhouse.homologation.db'),{readOnly:true});
const api='http://127.0.0.1:5449', token=process.env.PAGBANK_SANDBOX_DIAGNOSTIC_TOKEN;
if(!token)throw Error('Existing private sandbox credential required.');
const identity=await(await fetch(api+'/api/homologation/info')).json();
if(identity.environment!=='Homologation'||!identity.isolated||!identity.sandbox)throw Error('Isolation not confirmed.');
const fingerprint=()=>createHash('sha256').update(JSON.stringify(Object.fromEntries(['Orders','OrderItems','Payments','PaymentRefunds','AdminAuditLogs'].map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY Id`).all()])))).digest('hex');
const before=fingerprint(), results=[];
for(const[id,method]of[[4,'PIX'],[5,'CREDIT_CARD']]){
 const p=db.prepare('SELECT Id,OrderId,Status,Method,Amount,ExternalCheckoutId,ExternalPaymentId,ApprovedAt,ApprovalDateSource FROM Payments WHERE Id=?').get(id);
 const order=db.prepare('SELECT Id,Status,DeliveryFee FROM Orders WHERE Id=?').get(p.OrderId);
 if(p.Status!==2||Number(p.Amount)!==34.9||p.OrderId!==id||!/^CHAR_[a-z0-9-]+$/i.test(p.ExternalPaymentId??''))throw Error('Settled identity mismatch.');
 const response=await fetch('https://sandbox.api.pagseguro.com/charges/'+p.ExternalPaymentId,{headers:{Authorization:'Bearer '+token,Accept:'*/*'},redirect:'error'});
 if(response.status!==200)throw Error('Canonical sandbox lookup failed.');
 const c=await response.json();
 if(c.id!==p.ExternalPaymentId||c.reference_id!==`payment:${id}`||c.status!=='PAID'||c.amount?.value!==3490||c.amount?.currency!=='BRL'||c.payment_method?.type!==method)throw Error('Canonical settlement mismatch.');
 const queries=[];
 for(let n=0;n<3;n++){
  const response=await fetch(api+'/api/payments/'+id);const body=await response.json();
  if(response.status!==200||body.status!==2||body.orderId!==id||body.amount!==34.9)throw Error('Repeated reconciliation mismatch.');
  queries.push({httpStatus:response.status,paymentId:body.paymentId,orderId:body.orderId,status:body.status,method:body.method,amount:body.amount});
 }
 results.push({payment:p,order,provider:{id:c.id,reference:c.reference_id,status:c.status,amount:c.amount.value,currency:c.amount.currency,method:c.payment_method.type},queries});
}
const after=fingerprint();
const receipts=await readFile(path.join(root,'webhook-receipts.jsonl'),'utf8').then(s=>s.trim().split('\n').filter(Boolean).map(JSON.parse)).catch(()=>[]);
const log=await readFile('test-results/acceptance/pix-approved/api-webhook-diagnostics.log','utf8').catch(()=>'');
const report={checkedAt:new Date().toISOString(),validated:before===after,identity,manualAcceptance:{source:'Owner statement in attachment 2026-10-28',pixApproved:true,creditApproved:true,bothRecognizedInOwner:true,ownerNavigationAndOperationsAccepted:true,automaticRedirectNotExplicitlyConfirmed:true},results,
 idempotency:{beforeSha256:before,afterSha256:after,financialRowsAndAuditUnchanged:before===after,checkoutCreationRequests:0,chargeCreationRequests:0},
 webhook:{receipts,signatureAcceptedStageCount:(log.match(/signature-accepted/g)||[]).length,classification:'PENDENTE DE EVIDÊNCIA EXTERNA',note:'Correlated request for payment 5 was unsigned and rejected 401. Receipt/correlation alone does not prove provider authenticity.'},productionTouched:false};
if(!report.validated)throw Error('Reconciliation modified financial/audit rows unexpectedly.');
db.close();await writeFile('test-results/catalog-final/financial-closeout.json',JSON.stringify(report,null,2));console.log(JSON.stringify({validated:report.validated,payments:results.map(r=>({id:r.payment.Id,status:r.payment.Status,method:r.payment.Method,orderStatus:r.order.Status,provider:r.provider})),idempotency:report.idempotency,webhook:report.webhook},null,2));
