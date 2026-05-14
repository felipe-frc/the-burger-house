import { FORCE_STORE_OPEN, STORE_CLOSE_HOUR, STORE_OPEN_HOUR } from "./config.js";

export function formatPrice(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isValidHouseNumber(value) {
  return /^[0-9]+$/.test(value.trim());
}

export function isStoreOpenNow() {
  if (FORCE_STORE_OPEN) return true;

  const now = new Date();
  const hour = now.getHours();

  return hour >= STORE_OPEN_HOUR && hour < STORE_CLOSE_HOUR;
}