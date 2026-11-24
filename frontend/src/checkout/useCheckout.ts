import { apiRequest } from '../../../shared/storefront/lib/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CartItem } from '../utils/menu';
import { formatBRL } from '../utils/menu';
import type { StorefrontCatalog } from '../utils/useStorefrontCatalog';
import {
  ApiError, STORE_CONFIG, SUBMISSION_KEY, addressText, apiItems, catalogProduct, cents,
  clearCheckoutSession, clearPendingRecovery, createHostedCheckout, createOrder, digits, emptyCheckoutForm,
  fetchCatalog, getPayment, hasReturnParameters, isAllowedCheckoutUrl, isStoreOpenNow,
  isValidHouseNumber, lookupCep, normalizePaymentStatus, readSession, saveCheckoutSession,
  signature, stripReturnParameters, subtotal, validateDetails, ViaCepError,
  serializeCart, archivePaidReceipt, clearArchivedReceipt,
  readCheckoutDraft, saveCheckoutDraft, clearCheckoutDraft,
  type CheckoutForm, type DrawerSession, type PaymentStatusName,
} from './model';
import { readBasket, settleBasket, startBasket, CART_CHANGED } from './cartStorage';
import { trackDemoEvent, trackDemoPurchase } from '../privacy/analytics';
import { publicWhatsAppNumber } from '../privacy/publicContact';

export type Step = 'bag' | 'details' | 'review';
export type Notice = '' | 'legacyAccess' | 'catalog' | 'cart' | 'changed' | 'closed' | 'order' | 'checkout' | 'storage' | 'uncertain' | 'totals' | 'lookup' | 'missing' | 'unmatched';
export type CepState = 'idle' | 'loading' | 'invalid' | 'not-found' | 'network' | 'timeout' | 'incomplete' | 'cancelled' | 'valid';
const uncertainSubmission = () => { try { return !!sessionStorage.getItem(SUBMISSION_KEY); } catch { return false; } };

export function useCheckout({ isOpen, cart, onUpdateCart, onOpen, initialMode, storefrontCatalog }: {
  isOpen: boolean; cart: CartItem[]; onUpdateCart: (items: CartItem[]) => void; onOpen: () => void;
  initialMode: 'takeaway' | 'delivery';
  storefrontCatalog: StorefrontCatalog;
}) {
  const draft = useRef(readCheckoutDraft()).current;
  const [step, setStep] = useState<Step>(draft?.step ?? 'bag');
  const [form, setForm] = useState<CheckoutForm>(draft?.form ?? { ...emptyCheckoutForm, fulfillment: initialMode === 'delivery' ? 'delivery' : 'pickup' });
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutForm, boolean>>>({});
  const { catalog, catalogState, refreshCatalog, publishCatalog } = storefrontCatalog;
  const [notice, setNotice] = useState<Notice>(uncertainSubmission() ? 'uncertain' : '');
  const [cepState, setCepState] = useState<CepState>('idle');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [session, setSession] = useState<DrawerSession | null>(readSession);
  const [status, setStatus] = useState<PaymentStatusName | null>(null);
  const [missingReturn, setMissingReturn] = useState(() => hasReturnParameters() && !readSession());
  const lock = useRef(false), lookupLock = useRef(false);
  const sessionRef = useRef(session);
  const paymentWindow = useRef<Window | null>(null);
  const closeReservedWindow = () => { paymentWindow.current?.close(); paymentWindow.current = null; };
  const reservePaymentWindow = () => {
    // The sandbox rejects loopback callback URLs. Keep the local order tab available.
    if (['127.0.0.1', 'localhost'].includes(location.hostname)) paymentWindow.current = window.open('about:blank', '_blank');
  };
  const cepController = useRef<AbortController | null>(null);
  const lastMode = useRef(initialMode);
  const currentCart = useRef(cart); currentCart.current = cart;
  useEffect(() => {
    if (session || (!currentCart.current.length && step === 'bag')) clearCheckoutDraft();
    else saveCheckoutDraft(form, step);
  }, [form, step, session]);
  const openCallback = useRef(onOpen); openCallback.current = onOpen;
  const replaceSession = (next: DrawerSession) => { saveCheckoutSession(next); sessionRef.current = next; setSession(next); };
  const items = apiItems(cart, catalog);
  const [couponCode, setCouponCode] = useState('');
  const [couponDraft, setCouponDraft] = useState('');
  const [pricingMessage, setPricingMessage] = useState('');
  const [extrasCatalog, setExtrasCatalog] = useState<{ code: string; name: string; price: number; productCategory: string; maximumQuantity: number }[]>([]);
  const [pricedQuote, setPricedQuote] = useState<{ key: string; subtotal: number; discount: number; total: number } | null>(null);
  const customized = !!couponCode || cart.some(item => item.extras.length > 0);
  const quoteKey = JSON.stringify({ items: items.map(item => ({ code: item.code, price: item.price, quantity: item.quantity, extras: item.extras })), couponCode, orderType: form.fulfillment });
  const [pricingBusy, setPricingBusy] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    apiRequest<typeof extrasCatalog>('/api/products/extras', { signal: controller.signal })
      .then(setExtrasCatalog).catch(() => { if (!controller.signal.aborted) setExtrasCatalog([]); });
    return () => controller.abort();
  }, [isOpen]);
  useEffect(() => {
    if (!extrasCatalog.length) return;
    const next = cart.map(line => ({ ...line, extras: line.extras.map(extra => {
      const live = extrasCatalog.find(option => option.code === extra.id);
      return live ? { ...extra, name: live.name, price: live.price } : extra;
    }) }));
    if (JSON.stringify(next) !== JSON.stringify(cart)) onUpdateCart(next);
  }, [extrasCatalog, cart, onUpdateCart]);
  useEffect(() => {
    if (!customized) { setPricedQuote(null); setPricingBusy(false); return; }
    const controller = new AbortController();
    setPricingBusy(true); setPricingMessage('');
    apiRequest<{ subtotal: number; discount: number; total: number }>('/api/orders/quote', {
      method: 'POST', signal: controller.signal,
      body: JSON.stringify({ orderType: form.fulfillment, couponCode, items: items.map(item => ({
        productCode: item.code, quantity: item.quantity, extras: item.extras,
      })) }),
    }).then(quote => { if (!controller.signal.aborted) setPricedQuote({ ...quote, key: quoteKey }); })
      .catch(error => { if (!controller.signal.aborted) { setPricedQuote(null); setPricingMessage(error instanceof Error ? error.message : 'Não foi possível validar a sacola.'); } })
      .finally(() => { if (!controller.signal.aborted) setPricingBusy(false); });
    return () => controller.abort();
  }, [quoteKey, customized]);
  const itemSubtotal = customized && pricedQuote?.key === quoteKey ? pricedQuote.subtotal : subtotal(items);
  const discount = customized && pricedQuote?.key === quoteKey ? pricedQuote.discount : 0;
  const deliveryFee = cart.length && form.fulfillment === 'delivery' ? STORE_CONFIG.deliveryFeeEstimate : 0;
  const total = (cents(itemSubtotal) - cents(discount) + cents(deliveryFee)) / 100;
  const validCart = (!customized || pricedQuote?.key === quoteKey) && !pricingBusy && catalogState === 'ready' && items.length > 0 && items.every(item => item.available && item.code && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99);

  useEffect(() => {
    if (!isOpen) cepController.current?.abort();
  }, [isOpen]);
  useEffect(() => {
    if (lastMode.current === initialMode) return;
    lastMode.current = initialMode;
    if (!sessionRef.current && !lock.current) {
      cepController.current?.abort();
      setForm(current => ({ ...current, fulfillment: initialMode === 'delivery' ? 'delivery' : 'pickup' }));
    }
  }, [initialMode]);
  useEffect(() => () => cepController.current?.abort(), []);

  const checkPayment = useCallback(async () => {
    const context = sessionRef.current;
    if (!context?.paymentId || lookupLock.current) return null;
    if (!context.orderAccessToken) { setNotice('legacyAccess'); return null; }
    lookupLock.current = true; setChecking(true); setNotice('');
    try {
      const payment = await getPayment(context.paymentId, context.orderAccessToken);
      if (context !== sessionRef.current) return null;
      if (payment.paymentId !== context.paymentId || payment.orderId !== context.orderId ||
        !Number.isFinite(payment.amount) || cents(payment.amount) !== cents(context.total)) {
        setNotice('unmatched'); return null;
      }
      const confirmed = normalizePaymentStatus(payment.status);
      setStatus(confirmed);
      if (confirmed === 'Approved') {
        if (context.basketId && !context.cartApplied) {
          await settleBasket(context.basketId, context.orderId, context.cartSnapshot ?? []);
          void trackDemoPurchase(context.orderId);
        }
        const completed = { ...context, cartApplied: true };
        // Keep the approved confirmation in React memory only for the current presentation; clear auto-open checkout storage.
        archivePaidReceipt(completed);
        clearCheckoutSession(completed.orderId);
        clearCheckoutDraft();
        stripReturnParameters();
        sessionRef.current = completed;
        setSession(completed);
      } else if (confirmed === 'Rejected' || confirmed === 'Cancelled') {
        clearPendingRecovery(context.orderId);
      }
      return confirmed;
    } catch (error) { setNotice(error instanceof Error && error.message === 'cart-storage' ? 'storage' : 'lookup'); return null; }
    finally { lookupLock.current = false; setChecking(false); }
  }, []);
  useEffect(() => { if (isOpen && sessionRef.current?.paymentId && !sessionRef.current.cartApplied) void checkPayment(); }, [isOpen, checkPayment]);
  useEffect(() => {
    const resume = () => { if (document.visibilityState === 'visible' && !lock.current && sessionRef.current?.paymentId && !sessionRef.current.cartApplied) void checkPayment(); };
    window.addEventListener('focus', resume);
    return () => window.removeEventListener('focus', resume);
  }, [checkPayment]);
  useEffect(() => {
    const resume = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const previous = sessionRef.current;
      const saved = readSession(); sessionRef.current = saved; setSession(saved); setStatus(null);
      if (saved) { openCallback.current(); if (saved.paymentId) void checkPayment(); }
      else if (previous) {
        // An explicit new order in a newer history entry invalidates the old form.
        // Do not revive personal details or a paid basket from the browser cache.
        setForm({ ...emptyCheckoutForm, fulfillment: initialMode === 'delivery' ? 'delivery' : 'pickup' });
        setStep('bag'); setErrors({}); setNotice(''); setMissingReturn(false);
        window.dispatchEvent(new Event(CART_CHANGED)); void refreshCatalog();
      }
    };
    window.addEventListener('pageshow', resume);
    return () => window.removeEventListener('pageshow', resume);
  }, [checkPayment, initialMode, onUpdateCart, refreshCatalog]);

  const update = (name: keyof CheckoutForm, value: string) => {
    if (lock.current) return;
    if (name === 'zipCode' || name === 'fulfillment') {
      cepController.current?.abort();
      setCepState(current => current === 'loading' || (name === 'fulfillment' && current === 'cancelled') ? 'cancelled' : 'idle');
    }
    setForm(current => ({ ...current, ...(name === 'zipCode' ? { street: '', neighborhood: '', city: '' } : {}), [name]: value }));
    setErrors(current => ({ ...current, [name]: false }));
    if (!uncertainSubmission()) setNotice('');
  };
  const searchCep = async () => {
    if (form.fulfillment !== 'delivery' || lock.current) return;
    cepController.current?.abort();
    if (digits(form.zipCode).length !== 8) { setCepState('invalid'); setErrors(current => ({ ...current, zipCode: true })); return; }
    const controller = new AbortController(); cepController.current = controller;
    setCepState('loading');
    try {
      const address = await lookupCep(form.zipCode, controller.signal);
      if (controller !== cepController.current || controller.signal.aborted) return;
      setForm(current => ({ ...current, street: address.street, neighborhood: address.neighborhood, city: address.city }));
      setErrors(current => ({ ...current, zipCode: false, street: false, neighborhood: false, city: false }));
      setCepState(address.street && address.neighborhood && address.city ? 'valid' : 'incomplete');
    } catch (error) {
      if (controller !== cepController.current) return;
      setCepState(error instanceof ViaCepError ? ({ invalid: 'invalid', 'not-found': 'not-found', unavailable: 'network', timeout: 'timeout', cancelled: 'cancelled' } as const)[error.kind] : 'network');
    }
  };
  const validate = () => {
    const result: Partial<Record<keyof CheckoutForm, boolean>> = {};
    for (const name of Object.keys(validateDetails(form)) as (keyof CheckoutForm)[]) result[name] = true;
    // Keep the original numeric-only house number rule and the original UI note limit.
    if (form.fulfillment === 'delivery' && !isValidHouseNumber(form.houseNumber)) result.houseNumber = true;
    if (form.observation.length > 280) result.observation = true;
    if (cepState === 'loading' && form.fulfillment === 'delivery') result.zipCode = true;
    setErrors(result);
    const first = Object.keys(result)[0];
    if (first) requestAnimationFrame(() => document.getElementById(`checkout-${first}`)?.focus());
    return !first;
  };
  const go = (next: Step) => {
    if (lock.current) return;
    if (next !== 'bag' && !validCart) { setNotice('cart'); return; }
    if (next === 'review' && !validate()) { setStep('details'); return; }
    if (next === 'review' && step !== 'review') trackDemoEvent('begin_checkout');
    setStep(next); if (!uncertainSubmission()) setNotice('');
    requestAnimationFrame(() => {
      document.querySelector('.checkout-body')?.scrollTo(0, 0);
      document.querySelector<HTMLElement>('.checkout-step-title')?.focus({ preventScroll: true });
    });
  };
  const prepareHostedCheckout = async (context: DrawerSession) => {
    if (!context.orderAccessToken) { setNotice('legacyAccess'); return; }
    const checkout = await createHostedCheckout(context.orderId, context.orderAccessToken).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 409 && error.payload &&
          typeof error.payload === 'object' && 'code' in error.payload && error.payload.code === 'order_cancelled') {
        setStatus('Cancelled');
        return null;
      }
      throw error;
    });
    if (!checkout) return;
    if (!Number.isInteger(checkout.paymentId) || checkout.paymentId <= 0 || !isAllowedCheckoutUrl(checkout.checkoutUrl)) throw new Error('unsafe-checkout');
    replaceSession({ ...context, paymentId: checkout.paymentId, checkoutUrl: checkout.checkoutUrl });
    if (checkout.keepStoreOpen === true && paymentWindow.current && !paymentWindow.current.closed) {
      paymentWindow.current.opener = null;
      paymentWindow.current.location.replace(checkout.checkoutUrl);
      paymentWindow.current = null;
      setStatus('Pending');
      return;
    }
    closeReservedWindow();
    window.location.assign(checkout.checkoutUrl);
  };
  const submit = async () => {
    if (lock.current || lookupLock.current) return;
    if (uncertainSubmission()) { setNotice('uncertain'); return; }
    if (!isStoreOpenNow()) { setNotice('closed'); return; }
    if (!validate()) { setStep('details'); return; }
    if (!validCart) { setNotice('cart'); return; }
    reservePaymentWindow();
    lock.current = true; setBusy(true); setNotice('');
    let phase: 'catalog' | 'storage' | 'order' | 'checkout' = 'catalog';
    try {
      const nextCatalog = await fetchCatalog();
      const cartForOrder = currentCart.current.map(item => ({ ...item, extras: item.extras.map(extra => ({ ...extra })) }));
      const refreshed = apiItems(cartForOrder, nextCatalog);
      publishCatalog(nextCatalog);
      if (refreshed.some(item => !item.available || !item.code) ||
          JSON.stringify(refreshed.map(({ code, price, quantity }) => ({ code, price, quantity }))) !==
          JSON.stringify(items.map(({ code, price, quantity }) => ({ code, price, quantity })))) {
        setNotice('changed'); return;
      }
      const key = await signature({ ...form, observation: form.observation + (couponCode ? ` [${couponCode}]` : '') }, refreshed);
      let context = sessionRef.current;
      if (context && context.signature !== key) { setNotice('unmatched'); return; }
      if (!context) {
        phase = 'storage';
        sessionStorage.setItem(SUBMISSION_KEY, key);
        if (sessionStorage.getItem(SUBMISSION_KEY) !== key) throw new Error('storage');
        phase = 'order';
        const order = await createOrder(form, refreshed, couponCode);
        if (typeof order.orderAccessToken !== "string" || !order.orderAccessToken || !Number.isInteger(order.orderId) || order.orderId <= 0 ||
          ![order.subtotal, order.deliveryFee, order.total].every(value => Number.isFinite(value) && value >= 0) ||
          cents(order.subtotal) - cents(order.discount ?? 0) + cents(order.deliveryFee) !== cents(order.total)) throw new Error('invalid-order');
        context = { ...order, version: 1, paymentId: 0, fulfillment: form.fulfillment,
          basketId: readBasket().id, cartSnapshot: serializeCart(cartForOrder),
          items: refreshed.map(({ code, name, quantity }) => ({ code, name, quantity })),
          createdAt: new Date().toISOString(), signature: key,
          lines: refreshed.map(({ id, code, name, quantity, price }) => ({ id, code, name, quantity, price })),
          address: addressText(form, STORE_CONFIG.pickupAddress), observation: form.observation.trim() };
        // Keep the acknowledged order in memory even if browser storage suddenly fails.
        sessionRef.current = context; setSession(context);
        phase = 'storage'; saveCheckoutSession(context);
        sessionStorage.removeItem(SUBMISSION_KEY);
        if (cents(order.total) !== cents(total) || cents(order.subtotal) !== cents(itemSubtotal) || cents(order.deliveryFee) !== cents(deliveryFee)) {
          setNotice('totals'); return;
        }
      }
      phase = 'checkout'; await prepareHostedCheckout(context);
    } catch (error) {
      if (phase === 'order') {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
          sessionStorage.removeItem(SUBMISSION_KEY); setNotice('order');
        } else { setNotice('uncertain'); }
      } else setNotice(phase === 'catalog' ? 'catalog' : phase === 'storage' ? 'storage' : 'checkout');
    } finally { closeReservedWindow(); lock.current = false; setBusy(false); }
  };
  const resumePayment = async () => {
    let context = sessionRef.current;
    if (!context || lock.current || lookupLock.current) return;
    reservePaymentWindow();
    lock.current = true; setBusy(true); setNotice('');
    try {
      saveCheckoutSession(context);
      sessionStorage.removeItem(SUBMISSION_KEY);
      if (context.lines && cents(context.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)) !== cents(context.subtotal)) {
        const nextCatalog = await fetchCatalog();
        const lines = context.lines.map(line => {
          const product = catalogProduct(nextCatalog, line.id);
          return product?.available && product.code === line.code ? { ...line, price: product.price } : null;
        });
        if (lines.some(line => !line) || cents(lines.reduce((sum, line) => sum + (line?.price ?? 0) * (line?.quantity ?? 0), 0)) !== cents(context.subtotal)) {
          setNotice('unmatched'); return;
        }
        context = { ...context, lines: lines.filter(line => line !== null) };
        replaceSession(context);
      }
      // A saved URL or a return query never proves that a payment is still pending.
      if (context.paymentId) { const confirmed = await checkPayment(); if (confirmed !== 'Pending') return; }
      await prepareHostedCheckout(context);
    } catch { setNotice('checkout'); }
    finally { closeReservedWindow(); lock.current = false; setBusy(false); }
  };
  const whatsapp = async (english: boolean) => {
    const contact = publicWhatsAppNumber();
    if (!contact) return;
    const context = sessionRef.current;
    if (!context || lock.current || !context.lines || !context.address) return;
    const confirmed = await checkPayment();
    if (confirmed !== 'Approved' || context !== sessionRef.current) return;
    const money = (value: number) => formatBRL(value, english);
    const message = [ `${english ? 'Paid order' : 'Pedido pago'} #${context.orderId}`,
      context.fulfillment === 'pickup' ? (english ? 'Pickup' : 'Retirada') : (english ? 'Delivery' : 'Entrega'),
      ...context.lines.map(line => `${line.quantity}x ${line.name} (${money(line.price)} ${english ? 'each' : 'un.'}) — ${money(line.price * line.quantity)}`),
      `Subtotal: ${money(context.subtotal)}`, `${english ? 'Delivery fee' : 'Taxa de entrega'}: ${money(context.deliveryFee)}`,
      `Total: ${money(context.total)}`, `${english ? 'Address' : 'Endereço'}: ${context.address}`,
      ...(context.observation ? [`${english ? 'Notes' : 'Observações'}: ${context.observation}`] : []) ].join('\n');
    const url = `https://api.whatsapp.com/send/?phone=${contact}&text=${encodeURIComponent(message)}`;
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null; else window.location.assign(url);
  };
  const dismissConfirmation = () => {
    if (lock.current || lookupLock.current) return;
    const isTerminalStatus = status === 'Approved' || status === 'Rejected' || status === 'Cancelled';
    if (!missingReturn && !sessionRef.current?.cartApplied && !isTerminalStatus) return;
    const settledApproved = sessionRef.current?.cartApplied === true || status === 'Approved';
    const orderId = sessionRef.current?.orderId;
    clearCheckoutSession(orderId);
    clearCheckoutDraft();
    stripReturnParameters();
    sessionRef.current = null;
    setSession(null);
    setStatus(null);
    setMissingReturn(false);
    setNotice('');
    setErrors({});
    setStep('bag');
    if (settledApproved) {
      setCouponCode('');
      setCouponDraft('');
      setPricedQuote(null);
      setPricingMessage('');
      setForm({ ...emptyCheckoutForm, fulfillment: initialMode === 'delivery' ? 'delivery' : 'pickup' });
    }
  };
  const newOrder = () => {
    if (lock.current || lookupLock.current || (session && (!status || status === 'Pending'))) return;
    const orderId = sessionRef.current?.orderId;
    // Complete only the paid basket; products added later are retained.
    // Starting a new purchase changes this tab's basket; other tabs keep their own basket.
    clearCheckoutDraft(); startBasket(); onUpdateCart([]);
    setCouponCode(''); setCouponDraft(''); setPricedQuote(null);
    clearCheckoutSession(orderId); clearArchivedReceipt(); sessionRef.current = null; setSession(null); setStatus(null);
    setMissingReturn(false); setNotice(''); setErrors({}); setStep('bag');
    setForm({ ...emptyCheckoutForm, fulfillment: initialMode === 'delivery' ? 'delivery' : 'pickup' });
    stripReturnParameters(); void refreshCatalog();
  };
  return { step, form, errors, catalog, catalogState, notice: missingReturn ? 'missing' as const : notice,
    cepState, busy, checking, session, status, paymentView: !!session || missingReturn,
    items, itemSubtotal, discount, deliveryFee, total, validCart,
    extrasCatalog, couponCode, couponDraft, setCouponDraft, pricingBusy, pricingMessage,
    applyCoupon: () => setCouponCode(couponDraft.trim().toUpperCase()), removeCoupon: () => { setCouponCode(''); setCouponDraft(''); setPricingMessage(''); }, locked: () => lock.current || lookupLock.current,
    update, searchCep, go, submit, checkPayment, resumePayment, whatsapp, dismissConfirmation, newOrder, refreshCatalog,
    product: (id: string) => catalogProduct(catalog, id) };
}
