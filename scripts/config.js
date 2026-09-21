const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

export const API_BASE_URL =
  configuredApiBaseUrl || (import.meta.env.DEV ? "http://localhost:5041" : "");

export const DELIVERY_FEE = 5;

export const STORE_OPEN_HOUR = 18;

export const STORE_CLOSE_HOUR = 23;

export const STORE_ADDRESS = "Rua Dev 25, Uberlândia - MG";

export const WHATSAPP_PHONE_NUMBER = "5564999244855";

export const TOAST_DURATION_MS = 3000;

const configuredForceStoreOpen = String(import.meta.env.VITE_FORCE_STORE_OPEN ?? "")
  .trim()
  .toLowerCase();

export const FORCE_STORE_OPEN = configuredForceStoreOpen
  ? configuredForceStoreOpen === "true"
  : false;
