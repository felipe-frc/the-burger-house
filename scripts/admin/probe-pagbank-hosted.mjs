// Narrow interactive diagnostic: one fresh isolated order, native sandbox UI,
// no HAR, screenshots, cookies, customer values, card data or full PAY URL saved.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
let browser;
try {
const directory='test-results/acceptance/pagbank-422';
await mkdir(directory,{recursive:true});
const api='http://127.0.0.1:5449';
const identity=await (await fetch(api+'/api/homologation/info')).json();
if(identity.environment!=='Homologation'||!identity.isolated||!identity.sandbox)throw Error('Isolation not confirmed.');
const record={startedAt:new Date().toISOString(),identity,productionTouched:false,requests:[],providerResponses:[],actions:[]};
const products=await (await fetch(api+'/api/products')).json();
const classic=products.find(p=>p.name==='The Classic'&&p.isActive&&p.price===34.9);
if(!classic)throw Error('Expected isolated test product missing.');
let order;
if(process.argv.includes('--resume')){
 const previous=JSON.parse(await readFile(directory+'/hosted-probe.json','utf8'));
 order=previous.order;Object.assign(record,previous);delete record.finishedAt;
}else{
 if(!process.argv.includes('--new-order'))throw Error('Explicit --new-order or --resume required.');
 const orderResponse=await fetch(api+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderType:'pickup',customerName:'Comprador Homologacao',customerEmail:'homologacao@example.com',customerPhone:'11999990000',customerTaxId:'52998224725',items:[{productCode:classic.code,quantity:1}]})});
 if(orderResponse.status!==201)throw Error('Isolated test order not created: HTTP '+orderResponse.status);
 order=await orderResponse.json();record.order=order;
 record.requests.push({path:'/api/orders',status:orderResponse.status});
}
const checkoutResponse=await fetch(api+'/api/checkout/'+order.orderId,{method:'POST'});
record.requests.push({path:'/api/checkout/'+order.orderId,status:checkoutResponse.status});
if(checkoutResponse.status!==200)throw Error('Sandbox checkout creation failed: HTTP '+checkoutResponse.status);
const checkout=await checkoutResponse.json();
const payUrl=new URL(checkout.checkoutUrl);
if(payUrl.protocol!=='https:'||payUrl.host!=='pagamento.sandbox.pagbank.com.br')throw Error('Sandbox PAY host required.');
record.paymentId=checkout.paymentId;record.providerHost=payUrl.host;
browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const pending=[];
const safeHeaders=headers=>Object.fromEntries(Object.entries(headers).filter(([k,v])=> /^(x-request-id|x-correlation-id|request-id|correlation-id|traceparent|x-amzn-trace-id|x-b3-traceid|x-b3-spanid|content-type|date)$/.test(k)&&v.length<300));
const shape=value=>Array.isArray(value)?value.slice(0,3).map(shape):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).slice(0,60).map(([k,v])=>[k,shape(v)])):typeof value;
const genericText=value=>typeof value==='string'&&value.length<250&&/^(Não foi possível concluir a transação\.?|Tente (de novo|novamente) mais tarde\.?|Não foi possível concluir a transação\. Tente de novo mais tarde\.)$/.test(value)?value:'[redacted]';
const safeBody=value=>value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typeof v==='object'?safeBody(v):['title','subtitle','message','description'].includes(k)?genericText(v):['code','error_code'].includes(k)&&/^[A-Za-z_0-9-]{1,60}$/.test(String(v))?v:'[redacted]'])):'[redacted]';
page.on('response',response=>{
 const u=new URL(response.url());
 if(!u.hostname.includes('sandbox')||!(/\/pay\//.test(u.pathname)||response.status()>=400))return;
 pending.push((async()=>{
  const request=response.request();let payloadShape=null;try{payloadShape=shape(request.postDataJSON());}catch{}
  let body=null;try{body=safeBody(await response.json());}catch{}
  record.providerResponses.push({at:new Date().toISOString(),method:request.method(),endpoint:u.origin+u.pathname,status:response.status(),requestShape:payloadShape,requestCorrelation:safeHeaders(await request.allHeaders()),responseHeaders:safeHeaders(await response.allHeaders()),body});
 })());
});
await page.goto(payUrl.href,{waitUntil:'domcontentloaded',timeout:60000});
console.log(JSON.stringify({ready:true,order,paymentId:checkout.paymentId,providerHost:payUrl.host}));
const input=createInterface({input:process.stdin,output:process.stdout,terminal:false});
for await(const line of input){
 try{
  const command=JSON.parse(line);
  if(command.op==='snapshot')console.log(JSON.stringify(await page.locator('input,select,button').evaluateAll(elements=>elements.map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,placeholder:e.getAttribute('placeholder'),label:e.getAttribute('aria-label'),text:e.tagName==='BUTTON'?e.textContent?.trim().slice(0,90):undefined})))));
  else if(command.op==='fields')console.log(JSON.stringify(await page.locator('input:not([type=hidden]),select').evaluateAll(elements=>elements.map(e=>({name:e.name,empty:!e.value,required:e.required,invalid:e.getAttribute('aria-invalid'),disabled:e.disabled,readOnly:e.readOnly,valid:e.validity.valid,options:e.tagName==='SELECT'?Array.from(e.options).map(o=>({value:o.value,text:o.text})):undefined})))));
  else if(command.op==='select'){await page.locator(command.selector).selectOption(command.value);console.log('{"selected":true}');}
  else if(command.op==='fill'){if(new URL(page.url()).host!==payUrl.host)throw Error('Left sandbox.');await page.locator(command.selector).fill(command.value,{timeout:12000});console.log('{"filled":true}');}
  else if(command.op==='click'){if(new URL(page.url()).host!==payUrl.host)throw Error('Left sandbox.');await page.locator(command.selector).click({timeout:12000});record.actions.push({at:new Date().toISOString(),action:command.label||'native-ui-click'});console.log('{"clicked":true}');}
  else if(command.op==='status'){await Promise.allSettled(pending);await writeFile(directory+'/hosted-probe.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record));}
  else if(command.op==='finish'){await Promise.allSettled(pending);record.finishedAt=new Date().toISOString();await writeFile(directory+'/hosted-probe.json',JSON.stringify(record,null,2));await browser.close();input.close();break;}
 }catch(error){console.log(JSON.stringify({error:error.name,message:'Diagnostic UI action failed; no private values logged.'}));}
}
}catch{
 console.error('Sandbox diagnostic stopped; private URL, payload and credentials omitted.');
 process.exitCode=1;
}finally{
 await browser?.close();
}
