import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { saveConsent } from './consent';
import { startAnalytics, trackDemoEvent, trackDemoPurchase } from './analytics';
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis };
};

test('analytics is off until explicit configuration and consent; payloads exclude personal data; revoke preserves essentials', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://store.example.invalid/menu?email=must-not-leak@example.invalid&order_id=42' });
  for (const key of ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location'] as const)
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  Object.defineProperty(globalThis, 'Event', { configurable: true, value: dom.window.Event });
  try {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_key: string, work: () => void) => work() } });
  const id = 'G-SYNTHETIC01'; // Test-only fixture; no provider request is executed by JSDOM.
  localStorage.setItem('burger-house-basket-v2:synthetic', 'essential');
  saveConsent({ maps: false, analytics: false });
  const disabled = startAnalytics({ enabled: 'false', measurementId: id });
  assert.equal(document.scripts.length, 0); disabled();
  const invalid = startAnalytics({ enabled: 'true', measurementId: 'not-a-measurement-id' });
  assert.equal(document.scripts.length, 0); invalid();
  const stop = startAnalytics({ enabled: 'true', measurementId: id });
  assert.equal(document.scripts.length, 0);
  trackDemoEvent('view_menu');
  saveConsent({ maps: false, analytics: true });
  assert.equal(document.scripts.length, 1);
  trackDemoEvent('add_to_cart');
  await Promise.all([trackDemoPurchase(42), trackDemoPurchase(42)]);
  const host = window as unknown as Window & { dataLayer: IArguments[] };
  let events = host.dataLayer.map(value => Array.from(value)).filter(value => value[0] === 'event');
  assert.equal(events.filter(value => value[1] === 'demo_purchase').length, 1);
  assert.equal(events.filter(value => value[1] === 'purchase').length, 0);
  const payload = JSON.stringify(events);
  for (const sensitive of ['must-not-leak', 'email=', 'order_id', 'payment_id', 'customer', 'taxId', 'cpf', '42', 'value', 'revenue']) assert.equal(payload.includes(sensitive), false, sensitive);
  assert.ok(payload.includes('https://store.example.invalid/menu'));
  saveConsent({ maps: false, analytics: false });
  assert.equal(document.scripts.length, 0);
  assert.equal((window as unknown as Record<string, unknown>)[`ga-disable-${id}`], true);
  const before = host.dataLayer.length; trackDemoEvent('begin_checkout'); await trackDemoPurchase(43);
  assert.equal(host.dataLayer.length, before);
  assert.equal(localStorage.getItem('burger-house-basket-v2:synthetic'), 'essential');
  assert.equal(localStorage.getItem('burger-house-demo-events-v1'), null);
  stop();
  } finally { dom.window.close(); }
});
