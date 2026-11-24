import { test, expect } from './owner-react-fixture.js';
import { fixture, signIn } from './owner-contract-fixture.js';
import { mockData } from '../admin-fixtures.js';
import { assertUsable } from './owner-layout-assertions.js';
const syntheticMember = { id:1, name:'Colaborador sintético de homologação', email:'staff@example.invalid', role:'Entregador', department:'Operação', shift:'08:00–16:00', active:true, revision:1 };
async function operationalRecords(page) {
 await page.route('**/api/admin/team?*',r=>r.fulfill({json:{items:[syntheticMember],total:1,page:1,pageSize:20}}));
 await page.route('**/api/admin/team/1/operations?*',r=>r.fulfill({json:{days:[],entries:[],workedMinutes:0,extraMinutes:0,absences:0,lateDays:0,workedDays:0,extraAmount:null,payPolicy:null}}));
 await page.route('**/api/admin/stock',r=>r.fulfill({json:[{id:1,name:'Insumo sintético de homologação',unit:'kg',quantity:1,minimum:2,revision:1}]}));
 await page.route('**/api/admin/stock/1/movements?*',r=>r.fulfill({json:[]}));
}
const screens = [
  ['dashboard','Visão Geral'],['orders','Pedidos'],['kitchen','Cozinha'],['dispatch','Expedição'],
  ['deliveries','Entregas'],['products','Cardápio'],['inventory','Estoque'],['customers','Clientes'],
  ['finance','Financeiro'],['reports','Relatórios'],['team','Equipe'],['settings','Configurações'],
];

for(const width of [320,360,375,390,414,768,820,1024,1280,1440,1920]) {
 for(const dark of [false,true]) test('all Owner screens and overlays '+width+'px '+(dark?'dark':'light'),async({page},info)=>{
  test.setTimeout(120000);const evidence=[];
  await page.setViewportSize({width,height:width<768?640:900});
  await page.addInitScript(dark=>localStorage.setItem('tbh-owner-theme',dark?'dark':'light'),dark);
  await fixture(page);
  await operationalRecords(page);
  await page.goto('/admin/dashboard');await signIn(page);await expect(page.locator('.owner-overview')).toBeVisible();
  for(const[route,label]of screens){
   await page.goto('/admin/'+route);await expect(page.locator('main h1, main h2').first()).toBeVisible();
   await assertUsable(page,label,evidence);
   if(width===1440) await info.attach(route+'-'+(dark?'dark':'light'),{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
  }
  const modal=page.getByRole('dialog');
  for(const[route,button]of [['products','Cadastrar Novo Produto'],['inventory','Cadastrar insumo'],['team','Cadastrar Colaborador']]){
   await page.goto('/admin/'+route);const trigger=page.getByRole('button',{name:button,exact:true});
   await expect(trigger).toBeEnabled();await trigger.click();await expect(modal).toBeVisible();
   await assertUsable(page,button,evidence);await page.keyboard.press('Tab');
   expect(await modal.evaluate(el=>el.contains(document.activeElement))).toBe(true);
   await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);
  }
  for(const [route,button] of [['products','Editar O Praiano'],['inventory','Movimentar'],['inventory','Histórico'],['team','Editar '+syntheticMember.name],['team','Desativar']]) {
   await page.goto('/admin/'+route); await page.getByRole('button',{name:button,exact:true}).click();
   await expect(modal).toBeVisible();await assertUsable(page,button,evidence);
   await page.keyboard.press('Escape');await expect(modal).toHaveCount(0);
  }
  await page.goto('/admin/team');
  for(const area of ['Ponto e jornada','Pagamentos','Histórico administrativo']) {
   await page.getByRole('button',{name:area,exact:true}).click();
   await expect(page.locator('main form').first()).toBeVisible();
   await assertUsable(page,'Equipe · '+area,evidence);
  }
  await page.getByRole('button',{name:'Menu do proprietário',exact:true}).filter({visible:true}).click();
  await page.getByRole('menuitem',{name:'Histórico de auditoria',exact:true}).click();
  await expect(modal).toBeVisible();await assertUsable(page,'Audit Trail',evidence);await page.keyboard.press('Escape');
  await page.goto('/admin/orders/108');await expect(modal).toBeVisible();
  await assertUsable(page,'Detalhes do pedido',evidence);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Abrir agenda',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Agenda Administrativa'})).toBeVisible();
  await assertUsable(page,'Agenda calendário',evidence);
  await page.getByRole('button',{name:'Novo compromisso',exact:true}).click();
  await expect(page.getByLabel('Título *',{exact:true})).toBeVisible();
  await assertUsable(page,'Agenda formulário',evidence);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Busca global (Ctrl + K)',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Busca global'})).toBeVisible();
  await assertUsable(page,'Busca global',evidence);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Notificações',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await assertUsable(page,'Notificações',evidence);await page.keyboard.press('Escape');
  await page.route('**/api/admin/customers',r=>r.fulfill({json:[{name:'Cliente sintético de homologação',phone:'11999990000',deliveryAddress:null,purchases:[{orderId:108,createdAt:'2026-11-22T10:00:00Z',approvedAmount:60}]}]}));
  await page.goto('/admin/customers');
  await page.getByRole('button',{name:'Cliente sintético de homologação',exact:true}).click();
  await expect(modal).toBeVisible();await assertUsable(page,'Histórico do cliente',evidence);await page.keyboard.press('Escape');
  await page.route('**/api/admin/orders/operational?*',r=>{
   const detail=mockData('orders/108');detail.order.status='OutForDelivery';
   const rows=new URL(r.request().url()).searchParams.get('Status')==='OutForDelivery'?[detail]:[];
   return r.fulfill({json:{items:rows,total:rows.length,pageNumber:1,pageSize:20}});
  });
  await page.route('**/api/admin/delivery-tracking/108',r=>r.fulfill({json:{orderId:108,courierName:null,state:'Unassigned',lastReportedAtUtc:null,latitude:null,longitude:null,accuracy:null}}));
  await page.route('**/api/admin/delivery-tracking/couriers',r=>r.fulfill({json:[{id:1,name:syntheticMember.name}]}));
  await page.goto('/admin/deliveries');await page.getByRole('button',{name:'Acompanhar entrega',exact:true}).click();
  await expect(modal).toBeVisible();await assertUsable(page,'Acompanhamento da entrega',evidence);await page.keyboard.press('Escape');
  await info.attach('screen-viewport-matrix',{body:JSON.stringify({width,dark,cases:evidence}),contentType:'application/json'});
 });
}
test('Agenda prevents a second editor while its first save is pending',async({page})=>{
 await fixture(page);let release;const gate=new Promise(resolve=>{release=resolve;});let writes=0;
 await page.route('**/api/admin/agenda',async route=>{
  if(route.request().method()!=='POST')return route.fulfill({json:[]});
  writes++;await gate;return route.fulfill({json:{...route.request().postDataJSON().draft,id:'synthetic',revision:1}});
 });
 await page.goto('/admin/dashboard');await signIn(page);
 await page.getByRole('button',{name:'Abrir agenda',exact:true}).click();
 await page.getByRole('button',{name:'Novo compromisso',exact:true}).click();
 await page.getByLabel('Título *',{exact:true}).fill('Compromisso sintético');
 const save=page.getByRole('button',{name:/Criar compromisso|Salvar compromisso/});
 await save.click();await expect(save).toBeDisabled();
 await page.getByRole('button',{name:/Cancelar/}).click();
 await expect(page.getByRole('button',{name:'Novo compromisso',exact:true})).toBeDisabled();
 expect(writes).toBe(1);release();
 await expect(page.getByRole('button',{name:'Novo compromisso',exact:true})).toBeEnabled();
});

for(const [width,height] of [[820,360],[640,450]]) for(const dark of [false,true]) {
 test(`Owner low-height/reflow ${width}x${height} ${dark?'dark':'light'}`,async({page},info)=>{
  test.setTimeout(120000);const evidence=[];
  await page.setViewportSize({width,height});
  await page.addInitScript(dark=>localStorage.setItem('tbh-owner-theme',dark?'dark':'light'),dark);
  await fixture(page);await operationalRecords(page);
  await page.goto('/admin/dashboard');await signIn(page);
  for(const [route,label] of screens){
   await page.goto('/admin/'+route);await expect(page.locator('main h1, main h2').first()).toBeVisible();
   await assertUsable(page,label+' low-height',evidence);
  }
  await page.getByRole('button',{name:'Abrir agenda',exact:true}).click();
  await page.getByRole('button',{name:'Novo compromisso',exact:true}).click();
  await page.getByLabel('Título *',{exact:true}).fill('Título longo sintético '.repeat(8));
  await assertUsable(page,'Agenda long title low-height',evidence);
  const save=page.getByRole('button',{name:/Criar compromisso|Salvar compromisso/});
  await save.focus();await expect(save).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.goto('/admin/products');await page.getByRole('button',{name:'Cadastrar Novo Produto',exact:true}).click();
  await assertUsable(page,'Product low-height',evidence);
  await info.attach('screen-viewport-matrix',{body:JSON.stringify({width,height,dark,cases:evidence}),contentType:'application/json'});
 });
}
