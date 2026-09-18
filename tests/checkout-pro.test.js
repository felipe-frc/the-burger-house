// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  createCheckout: vi.fn(),
  getPaymentStatus: vi.fn(),
  toast: vi.fn(),
  error: vi.fn(),
  cart: [{ id: "burger-praiano", quantity: 1, price: 43.9 }],
  validAddress: true,
  orderType: "pickup",
}));
vi.mock("../scripts/api.js", () => mocks);
vi.mock("../scripts/cart.js", () => ({
  getCartSubtotal: () => 43.9,
  getCartTotalWithDelivery: () => 43.9,
  getDeliveryFee: () => 0,
  updateCart: vi.fn(),
}));
vi.mock("../scripts/state.js", () => ({
  getCart: () => mocks.cart,
  getOrderType: () => mocks.orderType,
  ORDER_TYPES: { PICKUP: "pickup" },
  clearCart: vi.fn(),
  resetOrderType: vi.fn(),
}));
vi.mock("../scripts/address.js", () => ({
  getAddressText: () => "Rua dos Testes 123",
  getIsFetchingCep: () => false,
  isPickupOrder: () => mocks.orderType === "pickup",
  resetAddressForm: vi.fn(),
  validateAddressFields: () => mocks.validAddress,
}));
vi.mock("../scripts/utils.js", () => ({
  escapeHTML: (value) => value,
  formatPrice: (value) => String(value),
  isStoreOpenNow: () => true,
}));
vi.mock("../scripts/ui.js", () => ({
  elements: {},
  closeAllModals: vi.fn(),
  openModal: vi.fn(),
  hidePaymentError: vi.fn(),
  showPaymentError: mocks.error,
  showToast: mocks.toast,
  showAddressWarning: vi.fn(),
  showClosedStoreMessage: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.validAddress = true;
  mocks.orderType = "pickup";
  mocks.cart = [{ id: "burger-praiano", quantity: 1, price: 43.9 }];
  document.body.innerHTML =
    '<p id="checkout-status"></p><button id="check-payment-btn"></button><button id="confirm-whatsapp-btn" class="hidden"></button>';
  mocks.createOrder.mockResolvedValue({ orderId: 99, subtotal: 43.9, deliveryFee: 0, total: 43.9 });
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
    initPoint: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test",
  });
});

it("creates an order and checkout, preserving return context without choosing a method", async () => {
  const { openPaymentStep } = await import("../scripts/order.js");
  await openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledWith("pickup", [
    { productCode: "burger-praiano", quantity: 1, observation: null },
  ]);
  expect(mocks.createCheckout).toHaveBeenCalledWith(99);
  const context = JSON.parse(sessionStorage.getItem("burger-house-checkout"));
  expect(context.paymentId).toBe(17);
  expect(context.message).toContain("Rua dos Testes 123");
  expect(context).not.toHaveProperty("paymentMethod");
});

it("does not create checkout if the order fails", async () => {
  mocks.createOrder.mockRejectedValue(new Error("offline"));
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.createCheckout).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalled();
});

it("reuses the order on checkout retry and prevents simultaneous submissions", async () => {
  mocks.createCheckout.mockRejectedValue(new Error("offline"));
  const { openPaymentStep } = await import("../scripts/order.js");
  await Promise.all([openPaymentStep(), openPaymentStep()]);
  await openPaymentStep();
  expect(mocks.createOrder).toHaveBeenCalledTimes(1);
  expect(mocks.createCheckout).toHaveBeenCalledTimes(2);
});

it("preserves delivery selection and blocks invalid addresses", async () => {
  mocks.orderType = "delivery";
  mocks.validAddress = false;
  const { openPaymentStep } = await import("../scripts/order.js");
  await openPaymentStep();
  expect(mocks.createOrder).not.toHaveBeenCalled();
  mocks.validAddress = true;
  await openPaymentStep();
  expect(mocks.createOrder.mock.calls[0][0]).toBe("delivery");
});

function savedContext() {
  sessionStorage.setItem(
    "burger-house-checkout",
    JSON.stringify({
      orderId: 99,
      paymentId: 17,
      total: 43.9,
      fingerprint: "saved",
      message: "pedido",
      confirmationDispatched: false,
    }),
  );
}

it("ignores approved URL parameters and uses the local backend status", async () => {
  savedContext();
  window.history.replaceState({}, "", "/?status=approved&payment_id=666");
  mocks.getPaymentStatus.mockResolvedValue({ paymentId: 17, orderId: 99, amount: 43.9, status: 1 });
  await (await import("../scripts/order.js")).checkCheckoutReturn();
  expect(mocks.getPaymentStatus).toHaveBeenCalledWith(17);
  expect(document.getElementById("confirm-whatsapp-btn").classList.contains("hidden")).toBe(true);
  expect(document.getElementById("checkout-status").textContent).toContain("Aguardando");
});

it("enables WhatsApp only for a matching locally approved payment", async () => {
  savedContext();
  mocks.getPaymentStatus.mockResolvedValue({ paymentId: 17, orderId: 99, amount: 43.9, status: 2 });
  await (await import("../scripts/order.js")).checkCheckoutReturn();
  expect(document.getElementById("confirm-whatsapp-btn").classList.contains("hidden")).toBe(false);
});

it("rejects a payment from another order", async () => {
  savedContext();
  mocks.getPaymentStatus.mockResolvedValue({
    paymentId: 17,
    orderId: 100,
    amount: 43.9,
    status: 2,
  });
  await (await import("../scripts/order.js")).checkCheckoutReturn();
  expect(mocks.error).toHaveBeenCalled();
  expect(document.getElementById("confirm-whatsapp-btn").classList.contains("hidden")).toBe(true);
});

it("never confirms without saved local context", async () => {
  await (await import("../scripts/order.js")).checkCheckoutReturn();
  expect(mocks.getPaymentStatus).not.toHaveBeenCalled();
});
