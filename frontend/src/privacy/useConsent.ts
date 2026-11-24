import { useSyncExternalStore } from 'react';
import { consentSnapshot, parseConsent, subscribeConsent } from './consent';

export function useConsent() {
  const raw = useSyncExternalStore(subscribeConsent, consentSnapshot, () => null);
  return parseConsent(raw);
}
