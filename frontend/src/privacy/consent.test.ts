import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_KEY, CONSENT_MAX_AGE, currentConsent, parseConsent, saveConsent, subscribeConsent } from './consent';
class MemoryStorage {
  values = new Map<string,string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
let local: MemoryStorage;
beforeEach(() => {
  local = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  const events = Object.assign(new EventTarget(), { setInterval, clearInterval });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  window.dispatchEvent(Object.assign(new Event('storage'), { key: CONSENT_KEY }));
});
test('defaults deny optional services; rejects malformed, future and expired records', () => {
  assert.equal(currentConsent(), null);
  const now = Date.now();
  for (const raw of ['invalid', '{}', JSON.stringify({ version: 1, maps: 1, analytics: true, updatedAt: now }), JSON.stringify({ version: 1, maps: true, analytics: true, updatedAt: now + 1 }), JSON.stringify({ version: 1, maps: true, analytics: true, updatedAt: now - CONSENT_MAX_AGE })]) assert.equal(parseConsent(raw, now), null);
});
test('accept, customize and revoke preserve essential basket and Owner preferences', () => {
  local.setItem('burger-house-basket-v2:synthetic', 'essential');
  local.setItem('owner-theme', 'dark');
  saveConsent({ maps: true, analytics: true }); assert.equal(currentConsent()?.analytics, true);
  saveConsent({ maps: true, analytics: false }); assert.equal(currentConsent()?.analytics, false);
  saveConsent({ maps: false, analytics: false }); assert.equal(currentConsent()?.maps, false);
  assert.equal(local.getItem('burger-house-basket-v2:synthetic'), 'essential');
  assert.equal(local.getItem('owner-theme'), 'dark');
  assert.deepEqual(Object.keys(JSON.parse(local.getItem(CONSENT_KEY)!)).sort(), ['analytics', 'maps', 'updatedAt', 'version']);
});
test('storage revocation from another tab is observed without clearing other data', () => {
  let notices = 0; const stop = subscribeConsent(() => notices++);
  saveConsent({ maps: true, analytics: false });
  local.removeItem(CONSENT_KEY);
  window.dispatchEvent(Object.assign(new Event('storage'), { key: CONSENT_KEY }));
  assert.equal(currentConsent(), null); assert.equal(notices, 2); stop();
});
