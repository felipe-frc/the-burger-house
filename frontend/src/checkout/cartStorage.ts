// Browser-only basket persistence. Each purchase has its own identity; preferences and Owner cookies are unrelated.
export const CART_POINTER = 'burger-house-active-basket-v2';
export const CART_PREFIX = 'burger-house-basket-v2:';
export const CART_CHANGED = 'burger-house-cart-changed';
export const CART_IDLE_MS = 30 * 60 * 1000;
export const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;
export const RECOVERY_KEY = 'burger-house-pending-checkout-v2';
export const RECEIPT_KEY = 'burger-house-last-receipt-v2';
export type StoredLine = { id: string; quantity: number; extras?: { id: string; name: string; price: number; quantity?: number }[]; customNotes?: string };
type Basket = { version: 2; id: string; updatedAt: number; items: StoredLine[]; appliedOrders: number[]; pendingUntil?: number };
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
let memory: Basket | undefined;
const notify = () => window.dispatchEvent(new Event(CART_CHANGED));
export function currentBasketId() {
  try { const id = sessionStorage.getItem(CART_POINTER); return validId(id) ? id : undefined; } catch { return memory?.id; }
}
export function startBasket(preferred?: string) {
  const id = validId(preferred) ? preferred : crypto.randomUUID();
  try { sessionStorage.setItem(CART_POINTER, id); } catch { /* In-memory purchases remain usable. */ }
  memory = { version: 2, id, updatedAt: Date.now(), items: [], appliedOrders: [] };
  return id;
}
function read(id: string): Basket {
  try {
    const value = JSON.parse(localStorage.getItem(CART_PREFIX + id) ?? 'null') as Basket | null;
    if (value?.version === 2 && value.id === id && Array.isArray(value.items) && Array.isArray(value.appliedOrders) &&
      Number.isFinite(value.updatedAt) && value.updatedAt <= Date.now()) {
      if (Date.now() - value.updatedAt < CART_IDLE_MS || Number.isFinite(value.pendingUntil) && value.pendingUntil! > Date.now()) return value;
      // Keep completion markers after item expiry: an old restored tab must never apply payment twice.
      const expired = { ...value, items: [], pendingUntil: undefined, updatedAt: Date.now() };
      write(expired); return expired;
    }
    if (value) localStorage.removeItem(CART_PREFIX + id);
  } catch { /* Invalid or unavailable browser storage never supplies a cart. */ }
  return memory?.id === id && Date.now() - memory.updatedAt < CART_IDLE_MS ? memory :
    { version: 2, id, updatedAt: Date.now(), items: [], appliedOrders: [] };
}
function write(value: Basket, durable = false) {
  memory = value;
  try { localStorage.setItem(CART_PREFIX + value.id, JSON.stringify(value)); }
  catch {
    if (durable) throw new Error('cart-storage');
    /* The checkout session separately checks durable storage before creating an order. */
  }
}
export function readBasket(preferred?: string) {
  const id = currentBasketId() ?? startBasket(preferred);
  return read(id);
}
export function persistBasket(items: StoredLine[]) {
  const value = readBasket();
  if (JSON.stringify(value.items) === JSON.stringify(items)) return;
  write({ ...value, items, updatedAt: Date.now() }); notify();
}
export function bindPendingBasket(id: string, createdAt: string) {
  if (!validId(id)) return;
  write({ ...read(id), pendingUntil: Date.parse(createdAt) + CHECKOUT_TTL_MS });
}
export function touchBasket() {
  const value = readBasket();
  if (value.items.length) write({ ...value, updatedAt: Date.now() });
}
export function lineIdentity(line: StoredLine) {
  return JSON.stringify([line.id, line.customNotes ?? '', (line.extras ?? []).map(e => [e.id, e.quantity ?? 1]).sort((a,b) => String(a[0]).localeCompare(String(b[0])))]);
}
export async function settleBasket(id: string, orderId: number, purchased: StoredLine[]) {
  if (!validId(id)) return;
  const settle = () => {
    const value = read(id);
    if (value.appliedOrders.includes(orderId)) return;
    const quantities = new Map(purchased.map(line => [lineIdentity(line), line.quantity]));
    const items = value.items.flatMap(line => {
      const remaining = line.quantity - (quantities.get(lineIdentity(line)) ?? 0);
      return remaining > 0 ? [{ ...line, quantity: remaining }] : [];
    });
    write({ ...value, items, pendingUntil: undefined, updatedAt: Date.now(), appliedOrders: [...value.appliedOrders, orderId] }, true);
    // Migration key only: new baskets never rehydrate this unbounded legacy storage.
    try { localStorage.removeItem('burger-house-drawer-cart-v1'); } catch { }
    notify();
  };
  if (navigator.locks) await navigator.locks.request('burger-house-basket:' + id, settle);
  else settle(); // One atomic record stores both resulting quantities and the applied order marker.
}
