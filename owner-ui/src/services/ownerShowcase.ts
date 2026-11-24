
const storageKey = 'burger-owner-showcase';
export const demoDate = '2026-11-17';
export const demoClock = Date.parse(`${demoDate}T22:36:00-03:00`);
let enabled: boolean | undefined;

export function showcaseEnabled() {
  if (!import.meta.env?.DEV || typeof window === 'undefined' ||
      !['localhost', '127.0.0.1'].includes(window.location.hostname)) return false;
  if (enabled !== undefined) return enabled;
  const requested = new URLSearchParams(window.location.search).get('showcase');
  try {
    if (requested === '1') window.sessionStorage.setItem(storageKey, '1');
    if (requested === '0') window.sessionStorage.removeItem(storageKey);
    enabled = requested === '1' || window.sessionStorage.getItem(storageKey) === '1';
  } catch { enabled = requested === '1'; }
  return enabled;
}

export const ownerNow = () => showcaseEnabled() ? demoClock : Date.now();
