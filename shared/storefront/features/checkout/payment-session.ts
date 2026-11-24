import type { CheckoutSession } from "./types";
import { isAllowedCheckoutUrl } from "./api";

const KEY = "burger-house-payment-v1";

export function saveCheckoutSession(session: CheckoutSession) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    throw new Error(
      "Não foi possível salvar o retorno do pagamento. Habilite o armazenamento do navegador e tente novamente.",
    );
  }
}

export function loadCheckoutSession(): CheckoutSession | null {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(KEY) ?? "null",
    ) as CheckoutSession | null;
    if (
      !value ||
      (value.orderAccessToken !== undefined && (typeof value.orderAccessToken !== "string" || value.orderAccessToken.length > 2048)) ||
      value.version !== 1 ||
      !Number.isInteger(value.orderId) ||
      value.orderId <= 0 ||
      !Number.isInteger(value.paymentId) ||
      value.paymentId < 0 ||
      (value.paymentId === 0 && value.checkoutUrl !== undefined) ||
      !["delivery", "pickup"].includes(value.fulfillment) ||
      ![value.total, value.subtotal, value.deliveryFee].every(
        (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
      ) ||
      !Array.isArray(value.items) ||
      !value.items.length ||
      value.items.some(
        (item) =>
          !item ||
          typeof item.code !== "string" ||
          typeof item.name !== "string" ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 99,
      ) ||
      (value.checkoutUrl !== undefined && !isAllowedCheckoutUrl(value.checkoutUrl))
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function clearCheckoutSession() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* Storage may be disabled. */
  }
}
