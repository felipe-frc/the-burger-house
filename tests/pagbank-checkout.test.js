// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
vi.mock("../scripts/api.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ...mocks,
}));
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
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.clear();
  mocks.validAddress = true;
  mocks.orderType = "pickup";
  mocks.cart = [{ id: "burger-praiano", quantity: 1, price: 43.9 }];
  document.body.innerHTML =
    '<p id="checkout-status"></p><button id="check-payment-btn"></button><button id="confirm-whatsapp-btn" class="hidden"></button>';
  mocks.createOrder.mockResolvedValue({ orderId: 99, subtotal: 43.9, deliveryFee: 0, total: 43.9 });
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
    checkoutUrl: "https://pagamento.pagbank.com.br/checkout/CHEC_test",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("creates an order and PagBank checkout, preserving return context without choosing a method", async () => {
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

it("requires the final checkoutUrl contract", async () => {
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
  });

  await (await import("../scripts/order.js")).openPaymentStep();

  expect(mocks.createCheckout).toHaveBeenCalledWith(99);
  expect(JSON.parse(sessionStorage.getItem("burger-house-checkout")).paymentId).toBeNull();
  expect(mocks.toast).toHaveBeenCalledWith("Invalid URL");
});

it("accepts the current PagBank Sandbox checkout host", async () => {
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
    checkoutUrl: "https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
  });

  await (await import("../scripts/order.js")).openPaymentStep();

  expect(JSON.parse(sessionStorage.getItem("burger-house-checkout")).paymentId).toBe(17);
  expect(mocks.toast).not.toHaveBeenCalled();
});

it("rejects a lookalike of the PagBank Sandbox checkout host", async () => {
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
    checkoutUrl: "https://pagamento.sandbox.pagbank.com.br.evil.example/pagamento?code=teste",
  });

  await (await import("../scripts/order.js")).openPaymentStep();

  expect(mocks.toast).toHaveBeenCalledWith("O checkout retornou um endereço inválido.");
  expect(JSON.parse(sessionStorage.getItem("burger-house-checkout")).paymentId).toBeNull();
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

it.each(["createOrder", "createCheckout"])("shows safe API errors from %s", async (operation) => {
  const { ApiError } = await import("../scripts/api.js");
  mocks[operation].mockRejectedValue(
    new ApiError("Fallback error", 409, {
      error: "Não foi possível preparar o pedido neste momento.",
      token: "do-not-log-token",
      customer: { cpf: "12345678900", address: "private-address" },
    }),
  );
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith("Não foi possível preparar o pedido neste momento.");
  expect(console.error).toHaveBeenCalledWith("Checkout preparation failed", {
    name: "ApiError",
    message: "Fallback error",
    status: 409,
    data: { error: "Não foi possível preparar o pedido neste momento." },
  });
  const logs = JSON.stringify(console.error.mock.calls);
  expect(logs).not.toContain("do-not-log-token");
  expect(logs).not.toContain("12345678900");
  expect(logs).not.toContain("private-address");
  if (operation === "createOrder") expect(mocks.createCheckout).not.toHaveBeenCalled();
});

it.each([
  "Bearer super-secret",
  "token=private-credential",
  "Falha em https://internal.example/api?key=private-credential",
  "Erro\n at checkout (internal.js:10:1)",
  "CPF 123.456.789-00",
])("does not expose unsafe error text: %s", async (message) => {
  const { ApiError } = await import("../scripts/api.js");
  const error = new ApiError(message, 502, { error: message, secret: "hidden-secret" });
  error.name = "private-name";
  mocks.createCheckout.mockRejectedValue(error);
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith("Não foi possível abrir o checkout. Tente novamente.");
  const logs = JSON.stringify(console.error.mock.calls);
  expect(logs).not.toContain(message);
  expect(logs).not.toContain("hidden-secret");
  expect(logs).not.toContain("private-name");
});

it("shows a safe Error message without logging its stack or custom properties", async () => {
  const error = new Error("Falha de conexão. Tente novamente.");
  error.token = "private-token";
  error.stack = "private-stack";
  mocks.createOrder.mockRejectedValue(error);
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith(error.message);
  expect(JSON.stringify(console.error.mock.calls)).not.toContain("private-");
});

it.each([
  [undefined, false],
  ["https://evil.example/payment", false],
  ["https://pagamento.pagbank.com.br/checkout/CHEC_test", true],
  ["https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste", true],
])("preserves redirect behavior for %s", async (checkoutUrl, allowed) => {
  mocks.createCheckout.mockResolvedValue({ paymentId: 17, checkoutUrl });
  const { openPaymentStep } = await import("../scripts/order.js");
  const location = { href: "https://shop.example/" };
  vi.stubGlobal("window", { location });
  await openPaymentStep();
  expect(location.href).toBe(allowed ? checkoutUrl : "https://shop.example/");
});

it("preserves a safe HTTP status message when the API has no error field", async () => {
  const { ApiError } = await import("../scripts/api.js");
  mocks.createCheckout.mockRejectedValue(new ApiError("A API retornou o status 502.", 502));
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith("A API retornou o status 502.");
});

it("uses the fallback without logging arbitrary thrown objects", async () => {
  mocks.createOrder.mockRejectedValue({ message: "private-value", token: "private-token" });
  await (await import("../scripts/order.js")).openPaymentStep();
  expect(mocks.toast).toHaveBeenCalledWith("Não foi possível abrir o checkout. Tente novamente.");
  expect(console.error).not.toHaveBeenCalled();
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
