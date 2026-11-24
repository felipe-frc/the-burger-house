// Essential checkout/authentication storage is deliberately outside this module.
export const CONSENT_KEY = 'burger-house-privacy-consent-v1';
export const CONSENT_EVENT = 'burger-house-privacy-consent-changed';
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
export type Choices = { maps: boolean; analytics: boolean };
export type Consent = Choices & { version: 1; updatedAt: number };
export const denied: Choices = { maps: false, analytics: false };
let memory: string | null = null;

export function parseConsent(raw: string | null, now = Date.now()): Consent | null {
  try {
    if (!raw || raw.length > 256) return null;
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.maps !== 'boolean' || typeof value.analytics !== 'boolean' ||
      !Number.isSafeInteger(value.updatedAt) || value.updatedAt > now || now - value.updatedAt >= CONSENT_MAX_AGE) return null;
    return { version: 1, updatedAt: value.updatedAt, maps: value.maps, analytics: value.analytics };
  } catch { return null; }
}
export function consentSnapshot(): string | null {
  let raw: string | null;
  try { raw = localStorage.getItem(CONSENT_KEY) ?? memory; } catch { raw = memory; }
  return parseConsent(raw) ? raw : null;
}
export function currentConsent(): Consent | null { return parseConsent(consentSnapshot()); }
export function saveConsent(choices: Choices): void {
  memory = JSON.stringify({ version: 1, updatedAt: Date.now(), maps: choices.maps === true, analytics: choices.analytics === true });
  try { localStorage.setItem(CONSENT_KEY, memory); } catch { /* Session-only choice; optional services still default to denied next visit. */ }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
export function subscribeConsent(listener: () => void) {
  const stored = (event: StorageEvent) => {
    if (event.key === CONSENT_KEY || event.key === null) { memory = null; listener(); }
  };
  window.addEventListener(CONSENT_EVENT, listener);
  window.addEventListener('storage', stored);
  // Re-evaluate expiry on return, even if no storage event occurred.
  window.addEventListener('focus', listener);
  const expiryCheck = window.setInterval(listener, 60000);
  return () => {
    window.removeEventListener(CONSENT_EVENT, listener);
    window.removeEventListener('storage', stored);
    window.removeEventListener('focus', listener);
    window.clearInterval(expiryCheck);
  };
}
