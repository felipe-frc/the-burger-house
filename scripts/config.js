const configuredApiBaseUrl = String(import.meta.env?.VITE_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

const hostname = globalThis.location?.hostname ?? "";

const isLocalDevelopment = hostname === "localhost" || hostname === "127.0.0.1";

const productionApiBaseUrl =
  "https://the-burger-house-api-gqfkakgnfvfxd0g0.brazilsouth-01.azurewebsites.net";

export const API_BASE_URL =
  configuredApiBaseUrl || (isLocalDevelopment ? "http://localhost:5041" : productionApiBaseUrl);

export const DELIVERY_FEE = 5;

export const STORE_OPEN_HOUR = 18;

export const STORE_CLOSE_HOUR = 23;

export const STORE_ADDRESS = "Rua Dev 25, Uberlândia - MG";

export const WHATSAPP_PHONE_NUMBER = "5564999244855";

export const TOAST_DURATION_MS = 3000;

const configuredForceStoreOpen = String(import.meta.env?.VITE_FORCE_STORE_OPEN ?? "")
  .trim()
  .toLowerCase();

export const FORCE_STORE_OPEN = configuredForceStoreOpen
  ? configuredForceStoreOpen === "true"
  : false;
