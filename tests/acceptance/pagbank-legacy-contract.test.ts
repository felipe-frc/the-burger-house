import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOrder, createHostedCheckout } from '../../src/features/checkout/api';
import { emptyCheckoutForm } from '../../src/features/checkout/types';

// Execute the actual pure mapping functions from the last revision on the date
// supplied by the owner, rather than retyping an assumed legacy contract.
const baseline='720dcd1e3e6719cd2751a7b548e2aec95a26c06b';
const legacy=execFileSync('git',['show',`${baseline}:scripts/order.js`],{encoding:'utf8'});
const ast=ts.createSourceFile('legacy-order.js',legacy,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions=['mapCartToApiItems','buildOrderPayload'].map(name=>{
 const node=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);
 if(!node)throw new Error(`Historical mapping ${name} not found.`);
 return node.getText(ast);
}).join('\n');
afterEach(()=>vi.unstubAllGlobals());
describe('2.0 preserves the 2026-10-15 checkout contract',()=>{
 for(const fulfillment of ['pickup','delivery'] as const){
  it(`matches historical buyer/cart mapping for ${fulfillment} with multiple items`,async()=>{
   const form={...emptyCheckoutForm,fulfillment,customerName:' Cliente Teste ',phone:'(11) 99999-0000',email:' comprador@example.com ',cpf:'529.982.247-25',zipCode:'38400-128',street:' Rua de Teste ',houseNumber:' 25 ',neighborhood:' Centro ',city:' Uberlândia ',complement:' ',observation:' Sem cebola '};
   const items=[{id:'the-classic',code:'the-classic-4ba04d7ead65',name:'The Classic',price:34.9,quantity:2,image:'/test.webp',imageAlt:'Produto',available:true},{id:'coca-cola',code:'drink-coca-lata',name:'Coca Cola',price:7,quantity:3,image:'/test.webp',imageAlt:'Produto',available:true}];
   const fields={'customer-name':form.customerName,'customer-phone':form.phone,'customer-email':form.email,'customer-tax-id':form.cpf,cep:form.zipCode,street:form.street,'house-number':form.houseNumber,neighborhood:form.neighborhood,city:form.city,complement:form.complement,'order-notes':form.observation};
   const context=vm.createContext({getOrderType:()=>fulfillment,ORDER_TYPES:{PICKUP:'pickup'},cart:items.map(i=>({id:i.code,quantity:i.quantity})),fields});
   const before=JSON.parse(JSON.stringify(vm.runInContext(`${functions}\nbuildOrderPayload(cart,fields)`,context)));
   const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({orderId:1,subtotal:90.8,deliveryFee:0,total:90.8}),{headers:{'content-type':'application/json'}}));
   vi.stubGlobal('fetch',request);
   await createOrder(form,items);
   const init=request.mock.calls[0][1] as RequestInit;
   const after=JSON.parse(String(init.body));
   expect(after).toEqual(before);
   expect(after.items).toEqual([{productCode:items[0].code,quantity:2,observation:null},{productCode:items[1].code,quantity:3,observation:null}]);
   expect(after.items[0]).not.toHaveProperty('price');
   expect(after.items[0]).not.toHaveProperty('id');
   expect(after).not.toHaveProperty('total');
   expect(after).not.toHaveProperty('paymentMethod');
  });
 }
 it('reuses the existing hosted checkout endpoint without a new payment payload',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({paymentId:65,checkoutUrl:'https://pagamento.sandbox.pagbank.com.br/pagamento?code=TEST'}),{headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',request);
  await createHostedCheckout(65);
  expect(request.mock.calls[0][0]).toBe('/api/checkout/65');
  expect(request.mock.calls[0][1]).toMatchObject({method:'POST'});
  expect(request.mock.calls[0][1].body).toBeUndefined();
 });
});
