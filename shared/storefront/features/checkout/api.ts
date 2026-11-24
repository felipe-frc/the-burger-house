import { apiRequest } from "../../lib/api-client";
import type { CartItem } from "../../lib/cart-types";
import type { CheckoutForm } from "./types";
import { digits } from "./validation";

export type OrderResponse = {
  orderId: number;
  orderAccessToken?: string;
  discount?: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
};

export type CheckoutResponse = {
  paymentId: number;
  checkoutUrl: string;
  keepStoreOpen?: boolean;
};

export type PaymentStatusName =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Cancelled"
  | "Refunded"
  | "PartiallyRefunded"
  | "ChargedBack";

export type PaymentResponse = {
  paymentId: number;
  orderId: number;
  amount: number;
  status: PaymentStatusName | number;
  method: string | number;
  createdAt: string;
  updatedAt?: string | null;
};

const paymentStatuses: Record<number, PaymentStatusName> = {
  1: "Pending",
  2: "Approved",
  3: "Rejected",
  4: "Cancelled",
  5: "Refunded",
  6: "PartiallyRefunded",
  7: "ChargedBack",
};

export function normalizePaymentStatus(status: PaymentResponse["status"]): PaymentStatusName {
  const normalized = typeof status === "number" ? paymentStatuses[status] : status;
  if (!normalized || !Object.values(paymentStatuses).includes(normalized)) {
    throw new Error("A loja retornou um status de pagamento desconhecido. Consulte novamente.");
  }
  return normalized;
}

export function createOrder(form: CheckoutForm, items: CartItem[], couponCode?: string) {
  if (
    !items.length ||
    items.some(
      (item) =>
        !item.available ||
        !item.code ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99,
    )
  ) {
    throw new Error("Confira os produtos e as quantidades do carrinho.");
  }
  return apiRequest<OrderResponse>("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      orderType: form.fulfillment,
      ...(couponCode ? { couponCode } : {}),
      customerName: form.customerName.trim(),
      customerPhone: digits(form.phone),
      customerEmail: form.email.trim(),
      customerTaxId: digits(form.cpf),
      zipCode: form.fulfillment === "delivery" ? form.zipCode.trim() : null,
      street: form.fulfillment === "delivery" ? form.street.trim() : null,
      houseNumber: form.fulfillment === "delivery" ? form.houseNumber.trim() : null,
      neighborhood: form.fulfillment === "delivery" ? form.neighborhood.trim() : null,
      city: form.fulfillment === "delivery" ? form.city.trim() : null,
      complement:
        form.fulfillment === "delivery" && form.complement.trim() ? form.complement.trim() : null,
      observation: form.observation.trim() || null,
      items: items.map((item) => ({
        productCode: item.code,
        quantity: item.quantity,
        observation: item.observation || null,
        ...(item.extras?.length ? { extras: item.extras } : {}),
      })),
    }),
  });
}

export class MissingOrderAccessError extends Error {
  constructor() { super("Esta compra antiga não possui comprovante de acesso neste navegador."); }
}
function orderHeaders(token?: string) {
  if (!token || token.length > 2048) throw new MissingOrderAccessError();
  return { "X-Order-Access": token };
}
export function createHostedCheckout(orderId: number, token?: string) {
  return apiRequest<CheckoutResponse>(`/api/checkout/${orderId}`, { method: "POST", headers: orderHeaders(token) });
}
export function getPayment(paymentId: number, token?: string) {
  return apiRequest<PaymentResponse>(`/api/payments/${paymentId}`, { headers: orderHeaders(token) });
}

export function isAllowedCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["pagamento.pagbank.com.br", "pagamento.sandbox.pagbank.com.br"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
