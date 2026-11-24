import { beforeEach, describe, expect, it } from "vitest";
import { loadCheckoutSession, saveCheckoutSession } from "./payment-session";
import { normalizePaymentStatus } from "./api";
import type { CheckoutSession } from "./types";

const session: CheckoutSession = {
  version: 1,
  orderId: 9,
  paymentId: 3,
  fulfillment: "pickup",
  subtotal: 43.9,
  deliveryFee: 0,
  total: 43.9,
  items: [{ code: "burger-praiano", name: "O Praiano", quantity: 1 }],
  createdAt: new Date().toISOString(),
  checkoutUrl: "https://pagamento.sandbox.pagbank.com.br/checkout/TEST",
};
beforeEach(() => sessionStorage.clear());
describe("payment recovery storage", () => {
  it("recovers order and trusted payment URL without customer PII", () => {
    saveCheckoutSession(session);
    expect(loadCheckoutSession()).toEqual(session);
  });
  it.each([
    { paymentId: -1 },
    { orderId: 0 },
    { total: -1 },
    { items: [null] },
    { checkoutUrl: "https://evil.test" },
  ])("ignores an invalid session %j", (change) => {
    sessionStorage.setItem("burger-house-payment-v1", JSON.stringify({ ...session, ...change }));
    expect(loadCheckoutSession()).toBeNull();
  });
  it("rejects unknown payment states", () => {
    expect(() => normalizePaymentStatus(90)).toThrow();
    expect(() => normalizePaymentStatus("PAID" as never)).toThrow();
  });
  it("recovers an order whose hosted checkout has not been prepared yet", () => {
    const { checkoutUrl: _url, ...pending } = session;
    saveCheckoutSession({ ...pending, paymentId: 0 });
    expect(loadCheckoutSession()?.paymentId).toBe(0);
  });
});
