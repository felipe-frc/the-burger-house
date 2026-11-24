import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CART_POINTER, CART_PREFIX, CART_IDLE_MS, CHECKOUT_TTL_MS, readBasket, startBasket, persistBasket, settleBasket, bindPendingBasket, type StoredLine } from './cartStorage';
class MemoryStorage {
  values = new Map<string,string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
let local: MemoryStorage, session: MemoryStorage;
const line = (quantity = 1): StoredLine => ({ id:'the-classic', quantity, extras:[] });
beforeEach(() => {
  local = new MemoryStorage(); session = new MemoryStorage();
  Object.defineProperty(globalThis,'localStorage',{ configurable:true, value:local });
  Object.defineProperty(globalThis,'sessionStorage',{ configurable:true, value:session });
  Object.defineProperty(globalThis,'window',{ configurable:true, value:new EventTarget() });
  Object.defineProperty(globalThis,'navigator',{ configurable:true, value:{} });
  startBasket();
});
test('active basket persists across reads and ignores the unbounded legacy cart on a fresh visit', () => {
  persistBasket([line(2)]); const id=readBasket().id;
  assert.equal(readBasket().items[0].quantity,2);
  assert.equal(session.getItem(CART_POINTER),id);
  local.setItem('burger-house-drawer-cart-v1',JSON.stringify([line(99)]));
  session.removeItem(CART_POINTER);
  assert.deepEqual(readBasket().items,[]);
  assert.equal(JSON.parse(local.getItem(CART_PREFIX+id)!).items[0].quantity,2);
});
test('idle expiry empties only this basket and preserves language preferences', () => {
  persistBasket([line()]); local.setItem('burgerShop:language','en-US');
  const basket=readBasket();
  local.setItem(CART_PREFIX+basket.id,JSON.stringify({ ...basket, updatedAt:Date.now()-CART_IDLE_MS-1 }));
  assert.deepEqual(readBasket().items,[]);
  assert.equal(local.getItem('burgerShop:language'),'en-US');
});
test('pending checkout extends item retention to its bounded 24-hour window', () => {
  persistBasket([line()]); const basket=readBasket();
  bindPendingBasket(basket.id,new Date().toISOString());
  const pending=JSON.parse(local.getItem(CART_PREFIX+basket.id)!);
  local.setItem(CART_PREFIX+basket.id,JSON.stringify({ ...pending,updatedAt:Date.now()-CART_IDLE_MS-1 }));
  assert.equal(readBasket().items.length,1);
  local.setItem(CART_PREFIX+basket.id,JSON.stringify({ ...pending,updatedAt:Date.now()-CHECKOUT_TTL_MS-1,pendingUntil:Date.now()-1 }));
  assert.deepEqual(readBasket().items,[]);
});
test('confirmed purchase removes purchased units once and retains units added afterwards', async () => {
  persistBasket([line(3)]); const id=readBasket().id;
  await settleBasket(id,42,[line(2)]);
  assert.equal(readBasket().items[0].quantity,1);
  await settleBasket(id,42,[line(2)]);
  assert.equal(readBasket().items[0].quantity,1);
  const stored=JSON.parse(local.getItem(CART_PREFIX+id)!);
  assert.deepEqual(stored.appliedOrders,[42]);
});
test('variants, item notes and another independent basket are not cleared by old payment', async () => {
  const purchased=line(); persistBasket([{...purchased,customNotes:'Sem cebola'}]);
  const old=readBasket().id;
  persistBasket([{...purchased,customNotes:'Molho separado'}]);
  const other=startBasket(); persistBasket([line(4)]);
  await settleBasket(old,42,[{...purchased,customNotes:'Sem cebola'}]);
  assert.equal(readBasket().id,other); assert.equal(readBasket().items[0].quantity,4);
  assert.equal(JSON.parse(local.getItem(CART_PREFIX+old)!).items[0].customNotes,'Molho separado');
});
test('shared tabs see the same empty basket after approval and after restoring a session', async () => {
  persistBasket([line()]); const id=readBasket().id;
  const tabB=new MemoryStorage(); tabB.setItem(CART_POINTER,id);
  await settleBasket(id,42,[line()]);
  Object.defineProperty(globalThis,'sessionStorage',{ configurable:true,value:tabB });
  assert.deepEqual(readBasket().items,[]);
  assert.deepEqual(JSON.parse(local.getItem(CART_PREFIX+id)!).items,[]);
});
test('completion marker survives item expiry and prevents a restored tab from clearing a new purchase', async () => {
  persistBasket([line()]); const id=readBasket().id;
  await settleBasket(id,42,[line()]);
  const done=JSON.parse(local.getItem(CART_PREFIX+id)!);
  local.setItem(CART_PREFIX+id,JSON.stringify({...done,updatedAt:Date.now()-CART_IDLE_MS-1}));
  assert.deepEqual(readBasket().items,[]);
  persistBasket([line(2)]); await settleBasket(id,42,[line()]);
  assert.equal(readBasket().items[0].quantity,2);
});
test('durable cleanup failure is explicit and a retry can complete it', async () => {
  persistBasket([line()]); const id=readBasket().id;
  const save=local.setItem.bind(local);
  local.setItem=()=>{throw new Error('QuotaExceededError');};
  await assert.rejects(settleBasket(id,42,[line()]),/cart-storage/);
  local.setItem=save;
  await settleBasket(id,42,[line()]);
  assert.deepEqual(readBasket().items,[]);
});
