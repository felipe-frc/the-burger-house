import { currentConsent, subscribeConsent } from './consent';

type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
let send: ((name: string, params: Record<string, number | string>) => void) | null = null;
const seen = new Set<number>();

export function validMeasurementId(value: unknown): value is string {
  return typeof value === 'string' && /^G-[A-Z0-9]{6,20}$/.test(value);
}
// No arbitrary event names, customer objects, URLs, IDs or free-form values can cross this API.
export function trackDemoEvent(name: 'view_menu' | 'add_to_cart' | 'begin_checkout') {
  if (currentConsent()?.analytics) send?.(name, { project_mode: 'demo' });
}
export async function trackDemoPurchase(orderId: number) {
  if (!currentConsent()?.analytics || !send || !Number.isSafeInteger(orderId) || orderId < 1 || !navigator.locks) return;
  // Cross-tab dedupe. On unavailable/blocked coordination, omit an optional event.
  // Only a local key is stored; neither order identity nor money is sent to GA4.
  try { await navigator.locks.request('burger-house-demo-events', () => {
    if (!currentConsent()?.analytics || !send || seen.has(orderId)) return;
    const now = Date.now();
    const raw = JSON.parse(localStorage.getItem('burger-house-demo-events-v1') ?? '[]');
    const stored = Array.isArray(raw) ? raw.filter(x => Number.isSafeInteger(x?.id) && Number.isFinite(x?.at) && now - x.at < 7 * 86400000) : [];
    if (stored.some(x => x.id === orderId)) { seen.add(orderId); return; }
    localStorage.setItem('burger-house-demo-events-v1', JSON.stringify([...stored, { id: orderId, at: now }].slice(-100)));
    seen.add(orderId); send('demo_purchase', { project_mode: 'demo' });
  }); } catch { /* Analytics failure never affects checkout, payment state or basket cleanup. */ }
}

export function startAnalytics(configuration: { enabled: unknown; measurementId: unknown }) {
  if (configuration.enabled !== 'true' || !validMeasurementId(configuration.measurementId)) return () => {};
  const id = configuration.measurementId;
  const host = window as AnalyticsWindow;
  const flags = host as unknown as Record<string, unknown>;
  let script: HTMLScriptElement | null = null;
  let enabled = false;
  const disable = () => {
    flags[`ga-disable-${id}`] = true; send = null; enabled = false;
    script?.remove(); script = null;
    // Only this measurement property's cookies; never authentication or basket cookies.
    for (const name of ['_ga', `_ga_${id.slice(2)}`]) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    }
    seen.clear();
    try { localStorage.removeItem('burger-house-demo-events-v1'); } catch { /* optional storage */ }
  };
  const sync = () => {
    if (!currentConsent()?.analytics || navigator.doNotTrack === '1' ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true) {
      if (enabled) disable();
      return;
    }
    if (enabled) return;
    enabled = true; flags[`ga-disable-${id}`] = false;
    host.dataLayer = [];
    host.gtag = function () { host.dataLayer!.push(arguments); };
    host.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    host.gtag('js', new Date());
    host.gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_flags: 'SameSite=Lax;Secure' });
    send = (name, params) => {
      if (enabled && currentConsent()?.analytics) host.gtag?.('event', name, {
        ...params, send_to: id, page_location: location.origin + (location.pathname === '/menu' ? '/menu' : '/'),
        page_referrer: '', page_title: 'The Burger House — demonstração',
      });
    };
    script = document.createElement('script');
    script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    script.referrerPolicy = 'no-referrer';
    script.onerror = () => { disable(); };
    document.head.append(script);
  };
  sync();
  const stop = subscribeConsent(sync);
  return () => { stop(); if (enabled) disable(); };
}
