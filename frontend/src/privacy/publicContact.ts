// Public business contact only. Never derive it from Owner identity or private profiles.
export function publicWhatsAppNumber(): string | null {
  const value: unknown = import.meta.env.VITE_PUBLIC_WHATSAPP_NUMBER;
  return import.meta.env.VITE_PUBLIC_WHATSAPP_VERIFIED === 'true' && typeof value === 'string' &&
    /^[1-9][0-9]{9,14}$/.test(value) ? value : null;
}
