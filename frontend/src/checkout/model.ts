// Reuse the existing storefront's contracts and pure services. No provider SDK or financial rules here.
import { fetchCatalog, type CatalogProduct } from '../../../shared/storefront/features/catalog/catalog';
import { loadCheckoutSession, saveCheckoutSession as savePaymentContext, clearCheckoutSession as clearPaymentContext } from '../../../shared/storefront/features/checkout/payment-session';
import { readBasket, persistBasket, currentBasketId, bindPendingBasket, CHECKOUT_TTL_MS, RECOVERY_KEY, RECEIPT_KEY, lineIdentity, startBasket, touchBasket, type StoredLine } from './cartStorage';
import type { CheckoutSession, CheckoutForm } from '../../../shared/storefront/features/checkout/types';
import { emptyCheckoutForm } from '../../../shared/storefront/features/checkout/types';
import type { CartItem as ApiCartItem } from '../../../shared/storefront/lib/cart-types';
import { BURGERS, SIDES_AND_DRINKS, type BurgerItem, type CartItem } from '../utils/menu';

export { fetchCatalog, loadCheckoutSession };
export { createOrder, createHostedCheckout, getPayment, isAllowedCheckoutUrl, normalizePaymentStatus } from '../../../shared/storefront/features/checkout/api';
export { emptyCheckoutForm } from '../../../shared/storefront/features/checkout/types';
export { digits, formatPhone, formatCpf, formatCep, validateDetails } from '../../../shared/storefront/features/checkout/validation';
export { lookupCep, ViaCepError } from '../../../shared/storefront/features/checkout/viacep';
export { STORE_CONFIG } from '../../../shared/storefront/config/store';
export { isStoreOpenNow, isValidHouseNumber } from '../../../scripts/utils.js';
export { ApiError } from '../../../shared/storefront/lib/api-client';
export type { CheckoutForm, CatalogProduct, ApiCartItem };
export type { OrderResponse, PaymentStatusName } from '../../../shared/storefront/features/checkout/api';

const aliases: Record<string, string> = {
  'coca-cola': 'coca-cola-original', 'coca-zero': 'coca-cola-zero', 'agua-gas': 'agua-com-gas',
};
export function catalogProduct(catalog: CatalogProduct[], id: string) {
  const product = catalog.find(item => item.storefrontId === (aliases[id] ?? id));
  return product?.code && catalog.some(item => item !== product && item.code === product.code)
    ? undefined : product;
}
export function apiItems(cart: CartItem[], catalog: CatalogProduct[]): ApiCartItem[] {
  return cart.map(item => {
    const product = catalogProduct(catalog, item.burger.id);
    return { id: item.burger.id, code: product?.code ?? '', name: product?.name ?? item.burger.name,
      price: (product?.price ?? item.burger.price) + item.extras.reduce((sum, extra) => sum + extra.price * (extra.quantity ?? 1), 0),
      extras: item.extras.map(extra => ({ code: extra.id, quantity: extra.quantity ?? 1 })), observation: item.customNotes, image: item.burger.image, imageAlt: item.burger.name,
      available: product?.available === true, quantity: item.quantity };
  });
}
export const cents = (value: number) => Math.round(value * 100);
export function subtotal(items: ApiCartItem[]) {
  return items.reduce((sum, item) => sum + cents(item.price) * item.quantity, 0) / 100;
}
export const CART_KEY = 'burger-house-drawer-cart-v1';
let visitStarted = false;
export function beginCartVisit() {
  if (visitStarted) return;
  visitStarted = true;
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const checkout = readSession();
  if (!checkout) {
    // Unbound v1 data has no expiry or purchase identity and must not survive the migration.
    try { localStorage.removeItem(CART_KEY); } catch { }
  }
  // Reload and history traversal belong to the active visit. A new document navigation is independent,
  // even when a browser restores sessionStorage after being closed. A pending checkout is an exception.
  if (navigation?.type === 'navigate' && currentBasketId() && !checkout) startBasket();
}
export const SUBMISSION_KEY = 'burger-house-drawer-submission-v1';
const DRAFT_PREFIX = 'burger-house-checkout-draft-v2:';
export function readCheckoutDraft(): { form: CheckoutForm; step: 'bag' | 'details' | 'review' } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_PREFIX + readBasket().id) ?? 'null');
    if (!value || !Number.isFinite(value.updatedAt) || Date.now() - value.updatedAt > 30 * 60000 || value.updatedAt > Date.now() ||
        !['bag','details','review'].includes(value.step) ||
        Object.keys(emptyCheckoutForm).some(key => typeof value.form?.[key] !== 'string' || value.form[key].length > 500) ||
        !['delivery','pickup'].includes(value.form.fulfillment)) return null;
    return value;
  } catch { return null; }
}
export function saveCheckoutDraft(form: CheckoutForm, step: 'bag' | 'details' | 'review') {
  try { touchBasket(); sessionStorage.setItem(DRAFT_PREFIX + readBasket().id, JSON.stringify({ form, step, updatedAt: Date.now() })); } catch { }
}
export function clearCheckoutDraft() { try { sessionStorage.removeItem(DRAFT_PREFIX + readBasket().id); } catch { } }
function menuProduct(id: string): BurgerItem | undefined {
  const burger = BURGERS.find(item => item.id === id);
  if (burger) return burger;
  const item = SIDES_AND_DRINKS.find(item => item.id === id);
  if (item) return { ...item, tagline: item.desc, badge: '', badgeType: 'classic', description: item.desc,
    ingredients: item.desc, prices: { small: item.price, medium: item.price, large: item.price } };
  if (typeof id === 'string' && /^catalog:[a-z0-9_-]{1,100}$/i.test(id)) return {
    id, name: 'Produto do cardápio', tagline: '', badge: '', badgeType: 'classic', description: '',
    ingredients: '', image: '', price: 0, prices: { small: 0, medium: 0, large: 0 },
  };
}
export function readDrawerCart(): CartItem[] {
  try {
    const context = readSession();
    const basket = readBasket(context?.basketId);
    // Adopt legacy data only when an acknowledged checkout still identifies the active purchase.
    const legacy = context && !context.basketId ? JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') : null;
    const saved: unknown = legacy ?? basket.items;
    if (!Array.isArray(saved)) return [];
    const seen = new Set<string>();
    const cart = saved.flatMap(item => {
      const burger = item && menuProduct(item.id);
      if (!burger || seen.has(burger.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return [];
      seen.add(burger.id);
      return [{ burger, quantity: item.quantity, size: 'medium' as const, extras: Array.isArray(item.extras) ? item.extras.filter((extra: { id: string; name: string; price: number; quantity: number }) => typeof extra.id === 'string' && typeof extra.name === 'string' && Number.isFinite(extra.price) && extra.price > 0 && Number.isInteger(extra.quantity ?? 1) && (extra.quantity ?? 1) >= 1 && (extra.quantity ?? 1) <= 3) : [], customNotes: typeof item.customNotes === 'string' ? item.customNotes.slice(0, 280) : '' }];
    });
    if (legacy) {
      persistDrawerCart(cart);
      const snapshot = serializeCart(cart).map(line => ({ ...line, quantity:
        context!.lines?.find(paid => paid.id === line.id)?.quantity ??
        context!.items.find(paid => paid.name === cart.find(item => item.burger.id === line.id)?.burger.name)?.quantity ?? 0
      })).filter(line => line.quantity > 0);
      saveCheckoutSession({ ...context!, basketId: basket.id, cartSnapshot: snapshot });
      localStorage.removeItem(CART_KEY);
    }
    return cart;
  } catch { return []; }
}
export function persistDrawerCart(cart: CartItem[]) {
  try { persistBasket(serializeCart(cart)); }
  catch { /* The in-memory cart remains usable; payment storage is checked separately. */ }
}
export const serializeCart = (cart: CartItem[]): StoredLine[] => cart.map(item => ({ id: item.burger.id, quantity: item.quantity, extras: item.extras, customNotes: item.customNotes }));
export function mergeCartMutation(base: CartItem[], desired: CartItem[], latest: CartItem[]): CartItem[] {
  const identity = (item: CartItem) => lineIdentity(serializeCart([item])[0]);
  const before = new Map(base.map(item => [identity(item), item]));
  const after = new Map(desired.map(item => [identity(item), item]));
  const result = new Map(latest.map(item => [identity(item), item]));
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(key)?.quantity ?? 0) - (before.get(key)?.quantity ?? 0);
    if (!delta) continue;
    const quantity = Math.min(99, Math.max(0, (result.get(key)?.quantity ?? 0) + delta));
    if (!quantity) result.delete(key);
    else result.set(key, { ...(result.get(key) ?? after.get(key)!), quantity });
  }
  return [...new Set([...desired.map(identity), ...latest.map(identity)])].flatMap(key => result.has(key) ? [result.get(key)!] : []);
}
export type ReceiptLine = { id: string; code: string; name: string; quantity: number; price: number };
export type DrawerSession = CheckoutSession & {
  basketId?: string;
  cartSnapshot?: StoredLine[];
  signature?: string;
  lines?: ReceiptLine[];
  address?: string;
  observation?: string;
};
export function readSession(): DrawerSession | null {
  try {
    // Never leave order access tokens or receipts persisted across browser restarts in localStorage.
    localStorage.removeItem(RECEIPT_KEY);
    const pending = JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? 'null');
    if (pending && (pending.cartApplied === true || !Number.isFinite(Date.parse(pending.createdAt)) || Date.now() - Date.parse(pending.createdAt) > CHECKOUT_TTL_MS)) localStorage.removeItem(RECOVERY_KEY);
  } catch { }
  let session = loadCheckoutSession() as DrawerSession | null;
  if (!session) {
    try {
      const recovered = JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? 'null') as DrawerSession | null;
      if (recovered && !recovered.cartApplied && (!currentBasketId() || currentBasketId() === recovered.basketId)) {
        savePaymentContext(recovered); session = loadCheckoutSession() as DrawerSession | null;
      }
    } catch { }
  }
  if (!session) return null;
  if (session.cartApplied) {
    clearCheckoutSession(session.orderId);
    return null;
  }
  const createdAt = Date.parse(session.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > Date.now() || Date.now() - createdAt > CHECKOUT_TTL_MS) {
    clearCheckoutSession(session.orderId); return null;
  }
  if (session.lines && (!Array.isArray(session.lines) || session.lines.some(line =>
    !line || typeof line.id !== 'string' || typeof line.code !== 'string' || typeof line.name !== 'string' ||
    !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99 || !Number.isFinite(line.price) || line.price < 0))) return null;
  if ((session.address !== undefined && typeof session.address !== 'string') ||
      (session.observation !== undefined && typeof session.observation !== 'string')) return null;
  if (session.basketId !== undefined && !/^[a-f0-9-]{36}$/.test(session.basketId)) return null;
  if (session.cartSnapshot !== undefined && (!Array.isArray(session.cartSnapshot) || session.cartSnapshot.some(line =>
    !line || typeof line.id !== 'string' || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99 ||
    line.extras !== undefined && (!Array.isArray(line.extras) || line.extras.some(extra => !extra || typeof extra.id !== 'string'))))) return null;
  return session;
}
export function clearPendingRecovery(orderId?: number) {
  try {
    const recovered = JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? 'null');
    if (recovered && (orderId === undefined || recovered.orderId === orderId)) localStorage.removeItem(RECOVERY_KEY);
  } catch { }
}
export function saveCheckoutSession(session: DrawerSession) {
  if (session.cartApplied) {
    clearCheckoutSession(session.orderId);
    return;
  }
  savePaymentContext(session);
  if (session.basketId) bindPendingBasket(session.basketId, session.createdAt);
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify(session)); }
  catch { /* sessionStorage still retains the acknowledged order. */ }
}
export function clearCheckoutSession(orderId?: number) {
  const context = loadCheckoutSession();
  clearPaymentContext();
  clearPendingRecovery(orderId ?? context?.orderId);
}
export function archivePaidReceipt(session: DrawerSession) {
  try { localStorage.removeItem(RECEIPT_KEY); } catch { }
  try {
    if (typeof session.orderAccessToken === 'string' && session.orderAccessToken) {
      // Restrict the authorized receipt proof to the active tab session and minimal lookup credentials.
      sessionStorage.setItem(RECEIPT_KEY, JSON.stringify({
        version: 2,
        orderId: session.orderId,
        orderAccessToken: session.orderAccessToken,
      }));
    }
    clearPendingRecovery(session.orderId);
  } catch { }
}
export function clearArchivedReceipt() {
  try { sessionStorage.removeItem(RECEIPT_KEY); } catch { }
  try { localStorage.removeItem(RECEIPT_KEY); } catch { }
}
const RETURN_PARAMETERS = ['status', 'payment_id', 'order_id', 'checkout_id', 'reference_id'] as const;
export function hasReturnParameters() {
  const query = new URLSearchParams(location.search);
  return RETURN_PARAMETERS.some(key => query.has(key));
}
export function stripReturnParameters() {
  try {
    const url = new URL(location.href);
    let changed = false;
    for (const key of RETURN_PARAMETERS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) history.replaceState(history.state, '', url);
  } catch { /* History replacement may be unavailable outside a browser document. */ }
}
export async function signature(form: CheckoutForm, items: ApiCartItem[]) {
  const value = JSON.stringify({ form, items: items.map(({ code, quantity, price, extras, observation }) => ({ code, quantity, price, extras, observation })) });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function addressText(form: CheckoutForm, pickupAddress: string) {
  return form.fulfillment === 'pickup' ? pickupAddress :
    `${form.street.trim()}, ${form.houseNumber.trim()} — ${form.neighborhood.trim()}, ${form.city.trim()} · ${form.zipCode}${form.complement.trim() ? ` · ${form.complement.trim()}` : ''}`;
}
