// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  createCheckout: vi.fn(),
  getPaymentStatus: vi.fn(),
}));
vi.mock("../scripts/api.js", () => mocks);
function setupOrderDom() {
  document.body.innerHTML = `
    <div id="cart-modal" class="hidden"></div>
    <div id="address-modal" class="hidden"></div>
    <div id="review-modal" class="hidden"></div>
    <div id="payment-modal" class="hidden"></div>

    <button id="cart-btn"></button>
    <button id="close-modal-btn"></button>
    <button id="go-to-address-btn"></button>
    <button id="back-to-cart-btn"></button>
    <button id="go-to-review-btn"></button>
    <button id="back-to-address-btn"></button>

    <button id="go-to-payment-btn">
      <span>Ir para pagamento</span>
    </button>

    <button id="back-to-review-btn">
      <span>Voltar</span>
    </button>

    <div id="cart-items"></div>
    <div id="cart-total"></div>
    <div id="cart-count"></div>
    <div id="cart-item-count-label"></div>

    <div id="review-items"></div>
    <div id="review-address"></div>
    <div id="review-total"></div>

    <div id="delivery-fields"></div>

    <div
      id="pickup-info"
      class="hidden"
    ></div>

    <p
      id="address-warn"
      class="hidden"
    ></p>

    <span
      id="cep-loading"
      class="hidden"
    ></span>

    <input id="cep" />
    <input id="street" />
    <input id="neighborhood" />
    <input id="city" />
    <input id="house-number" />
    <input id="complement" />

    <textarea id="order-notes"></textarea>



    <div id="payment-total"></div>

    <p
      id="payment-error"
      class="hidden"
    ></p>

    <progress
      id="payment-progress"
      class="hidden"
      value="0"
      max="100"
    ></progress>

    <input
      type="radio"
      id="order-type-delivery"
      name="order-type"
      value="delivery"
      checked
    />

    <input
      type="radio"
      id="order-type-pickup"
      name="order-type"
      value="pickup"
    />
  `;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("VITE_FORCE_STORE_OPEN", "false");
  vi.setSystemTime(new Date("2026-01-01T20:00:00"));
  localStorage.clear();
  sessionStorage.clear();
  setupOrderDom();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<p id="checkout-status"></p><button id="check-payment-btn"></button><button id="confirm-whatsapp-btn"></button>',
  );
  vi.stubGlobal(
    "Toastify",
    vi.fn(() => ({ showToast: vi.fn() })),
  );
  window.open = vi.fn(() => ({}));
  mocks.createOrder.mockResolvedValue({ orderId: 99, subtotal: 43.9, deliveryFee: 0, total: 43.9 });
  mocks.createCheckout.mockResolvedValue({
    paymentId: 17,
    initPoint: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test",
  });
  mocks.getPaymentStatus.mockResolvedValue({ paymentId: 17, orderId: 99, amount: 43.9, status: 2 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function setup(type = "pickup") {
  const state = await import("../scripts/state.js");
  state.setCart([{ id: "burger-praiano", name: "O Praiano", price: 43.9, quantity: 1 }]);
  state.setOrderType(type);
  const order = await import("../scripts/order.js");
  return { state, order };
}
it("reviews a pickup order, confirms through backend and sends the preserved message once", async () => {
  const { state, order } = await setup();
  order.bindOrderEvents();
  document.getElementById("order-notes").value = "Sem cebola.";
  for (const id of [
    "cart-btn",
    "go-to-address-btn",
    "back-to-cart-btn",
    "go-to-review-btn",
    "back-to-address-btn",
    "go-to-review-btn",
    "back-to-review-btn",
  ])
    document.getElementById(id).click();
  expect(document.getElementById("review-items").textContent).toContain("O Praiano");
  expect(document.getElementById("review-total").textContent.replaceAll("\u00a0", " ")).toContain(
    "43,90",
  );
  await order.openPaymentStep();
  expect(window.open).not.toHaveBeenCalled();
  document.getElementById("confirm-whatsapp-btn").click();
  await vi.advanceTimersByTimeAsync(20);
  const message = new URL(window.open.mock.calls[0][0]).searchParams.get("text");
  expect(message).toContain("O Praiano");
  expect(message).toContain("Sem cebola.");
  expect(state.getCart()).toEqual([]);
  expect(document.getElementById("order-notes").value).toBe("");
  document.getElementById("confirm-whatsapp-btn").click();
  await vi.advanceTimersByTimeAsync(20);
  expect(window.open).toHaveBeenCalledTimes(1);
});
it("restores delivery fields and notes when returning in the same tab", async () => {
  let { order } = await setup("delivery");
  const fields = {
    cep: "38400-000",
    street: "Rua dos Testes",
    neighborhood: "Centro",
    city: "Uberlandia",
    "house-number": "123",
    complement: "Apto 1",
    "order-notes": "Sem cebola",
  };
  for (const [id, value] of Object.entries(fields)) document.getElementById(id).value = value;
  await order.openPaymentStep();
  for (const id of Object.keys(fields)) document.getElementById(id).value = "";
  vi.resetModules();
  order = (await setup("delivery")).order;
  order.bindOrderEvents();
  await vi.advanceTimersByTimeAsync(20);
  for (const [id, value] of Object.entries(fields))
    expect(document.getElementById(id).value).toBe(value);
  document.getElementById("go-to-review-btn").click();
  expect(document.getElementById("review-address").textContent).toContain("123");
});
it("preserves a new cart when confirming the previous purchase", async () => {
  const { state, order } = await setup();
  order.bindOrderEvents();
  await order.openPaymentStep();
  state.setCart([{ id: "burger-praiano", name: "O Praiano", price: 43.9, quantity: 2 }]);
  document.getElementById("confirm-whatsapp-btn").click();
  await vi.advanceTimersByTimeAsync(20);
  expect(state.getCart()[0].quantity).toBe(2);
  expect(window.open).toHaveBeenCalledOnce();
});
it("blocks checkout for an empty cart or closed restaurant", async () => {
  const { state, order } = await setup();
  order.bindOrderEvents();
  state.clearCart();
  document.getElementById("go-to-address-btn").click();
  await order.openPaymentStep();
  document.getElementById("back-to-review-btn").click();
  expect(document.getElementById("review-total").textContent).toContain("0,00");
  state.setCart([{ id: "burger-praiano", quantity: 1, price: 43.9 }]);
  vi.setSystemTime(new Date("2026-01-01T10:00:00"));
  document.getElementById("go-to-address-btn").click();
  document.getElementById("go-to-review-btn").click();
  await order.openPaymentStep();
  document.getElementById("close-modal-btn").click();
  expect(mocks.createOrder).not.toHaveBeenCalled();
});
