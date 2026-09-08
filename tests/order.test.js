// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createOrderMock,
  createPaymentMock,
  processCardPaymentMock,
  initializePaymentFormMock,
  unmountPaymentFormMock,
} = vi.hoisted(() => ({
  createOrderMock: vi.fn(),
  createPaymentMock: vi.fn(),
  processCardPaymentMock: vi.fn(),
  initializePaymentFormMock: vi.fn(),
  unmountPaymentFormMock: vi.fn(),
}));

vi.mock("../scripts/api.js", () => ({
  createOrder: createOrderMock,
  createPayment: createPaymentMock,
  processCardPayment: processCardPaymentMock,
}));

vi.mock("../scripts/payment.js", () => ({
  initializePaymentForm: initializePaymentFormMock,
  unmountPaymentForm: unmountPaymentFormMock,
}));

const localStorageMock = (() => {
  let store = {};

  return {
    getItem(key) {
      return store[key] || null;
    },

    setItem(key, value) {
      store[key] = String(value);
    },

    removeItem(key) {
      delete store[key];
    },

    clear() {
      store = {};
    },
  };
})();

vi.stubGlobal("localStorage", localStorageMock);

let paymentSubmitCallback = null;

function normalizeCurrency(value) {
  return value.replace(/\u00A0/g, " ");
}

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

    <form id="form-checkout">
      <input
        id="form-checkout__cardholderName"
      />

      <select
        id="form-checkout__issuer"
      ></select>

      <select
        id="form-checkout__installments"
      ></select>

      <select
        id="form-checkout__identificationType"
      ></select>

      <input
        id="form-checkout__identificationNumber"
      />

      <input
        id="form-checkout__cardholderEmail"
      />

      <button
        id="form-checkout__submit"
        type="submit"
      >
        Pagar
      </button>
    </form>

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

async function loadOrderModules() {
  vi.resetModules();

  const order = await import("../scripts/order.js");

  const state = await import("../scripts/state.js");

  return {
    order,
    state,
  };
}

function fillDeliveryAddress() {
  document.getElementById("cep").value = "38400-000";

  document.getElementById("street").value = "Rua dos Testes";

  document.getElementById("neighborhood").value = "Centro";

  document.getElementById("city").value = "Uberlândia";

  document.getElementById("house-number").value = "123";

  document.getElementById("complement").value = "Apto 101";
}

function getCardData(token = "test-card-token") {
  return {
    token,
    paymentMethodId: "visa",
    installments: "1",
    cardholderEmail: "teste@testuser.com",
  };
}

beforeEach(() => {
  vi.useFakeTimers();

  vi.setSystemTime(new Date("2026-01-01T20:00:00"));

  vi.restoreAllMocks();

  createOrderMock.mockReset();
  createPaymentMock.mockReset();
  processCardPaymentMock.mockReset();

  initializePaymentFormMock.mockReset();
  unmountPaymentFormMock.mockReset();

  paymentSubmitCallback = null;

  localStorage.clear();

  setupOrderDom();

  vi.stubGlobal(
    "Toastify",
    vi.fn(() => ({
      showToast: vi.fn(),
    })),
  );

  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
  });

  window.open = vi.fn(() => ({}));

  initializePaymentFormMock.mockImplementation(async (_amount, onSubmit) => {
    paymentSubmitCallback = onSubmit;

    return {};
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("order", () => {
  it("creates a delivery order before payment and opens WhatsApp only after approval", async () => {
    createOrderMock.mockResolvedValue({
      orderId: 100,
      subtotal: 43.9,
      deliveryFee: 5,
      total: 48.9,
    });

    createPaymentMock.mockResolvedValue({
      paymentId: 200,
      orderId: 100,
      amount: 48.9,
      status: 1,
    });

    processCardPaymentMock.mockResolvedValue({
      paymentId: 200,
      orderId: 100,
      amount: 48.9,
      status: 2,
      externalOrderId: "ORDER-TEST",
      externalPaymentId: "PAYMENT-TEST",
    });

    const { order, state } = await loadOrderModules();

    state.setCart([
      {
        id: "burger-praiano",
        name: "O Praiano",
        price: 43.9,
        quantity: 1,
      },
    ]);

    state.setOrderType(state.ORDER_TYPES.DELIVERY);

    fillDeliveryAddress();

    document.getElementById("order-notes").value = "Sem cebola.";

    order.bindOrderEvents();

    document.getElementById("go-to-payment-btn").click();

    await vi.advanceTimersByTimeAsync(20);

    expect(createOrderMock).toHaveBeenCalledOnce();

    expect(createOrderMock).toHaveBeenCalledWith("delivery", [
      {
        productCode: "burger-praiano",
        quantity: 1,
        observation: null,
      },
    ]);

    expect(initializePaymentFormMock).toHaveBeenCalledWith(48.9, expect.any(Function));

    expect(window.open).not.toHaveBeenCalled();

    expect(paymentSubmitCallback).toBeTypeOf("function");

    await paymentSubmitCallback(getCardData());

    expect(createPaymentMock).toHaveBeenCalledOnce();

    expect(createPaymentMock).toHaveBeenCalledWith(100, "11111111-1111-4111-8111-111111111111");

    expect(processCardPaymentMock).toHaveBeenCalledWith(200, {
      paymentToken: "test-card-token",
      paymentMethodId: "visa",
      installments: 1,
      payerEmail: "teste@testuser.com",
    });

    expect(window.open).toHaveBeenCalledOnce();

    const [url, target] = window.open.mock.calls[0];

    const decoded = normalizeCurrency(decodeURIComponent(url));

    expect(target).toBe("_blank");

    expect(decoded).toContain("Novo Pedido - The Burger House");

    expect(decoded).toContain("O Praiano");

    expect(decoded).toContain("Subtotal: R$ 43,90");

    expect(decoded).toContain("Taxa de entrega: R$ 5,00");

    expect(decoded).toContain("Total: R$ 48,90");

    expect(decoded).toContain("Rua dos Testes, 123 - Centro, Uberlândia");

    expect(decoded).toContain("Complemento: Apto 101");

    expect(decoded).toContain("Sem cebola.");

    expect(state.getCart()).toEqual([]);

    expect(document.getElementById("order-notes").value).toBe("");
  });

  it("creates and pays a pickup order without delivery fee", async () => {
    createOrderMock.mockResolvedValue({
      orderId: 101,
      subtotal: 43.9,
      deliveryFee: 0,
      total: 43.9,
    });

    createPaymentMock.mockResolvedValue({
      paymentId: 201,
      orderId: 101,
      amount: 43.9,
      status: 1,
    });

    processCardPaymentMock.mockResolvedValue({
      paymentId: 201,
      orderId: 101,
      amount: 43.9,
      status: 2,
      externalOrderId: "ORDER-PICKUP",
      externalPaymentId: "PAYMENT-PICKUP",
    });

    const { order, state } = await loadOrderModules();

    state.setCart([
      {
        id: "burger-praiano",
        name: "O Praiano",
        price: 43.9,
        quantity: 1,
      },
    ]);

    state.setOrderType(state.ORDER_TYPES.PICKUP);

    order.bindOrderEvents();

    document.getElementById("go-to-payment-btn").click();

    await vi.advanceTimersByTimeAsync(20);

    expect(createOrderMock).toHaveBeenCalledWith("pickup", [
      {
        productCode: "burger-praiano",
        quantity: 1,
        observation: null,
      },
    ]);

    expect(initializePaymentFormMock).toHaveBeenCalledWith(43.9, expect.any(Function));

    expect(window.open).not.toHaveBeenCalled();

    await paymentSubmitCallback(getCardData());

    expect(createPaymentMock).toHaveBeenCalledWith(101, "11111111-1111-4111-8111-111111111111");

    expect(processCardPaymentMock).toHaveBeenCalledWith(201, {
      paymentToken: "test-card-token",
      paymentMethodId: "visa",
      installments: 1,
      payerEmail: "teste@testuser.com",
    });

    expect(window.open).toHaveBeenCalledOnce();

    const [url] = window.open.mock.calls[0];

    const decoded = normalizeCurrency(decodeURIComponent(url));

    expect(decoded).toContain("Tipo de pedido");

    expect(decoded).toContain("Retirada no local");

    expect(decoded).toContain("Taxa de entrega: R$ 0,00");

    expect(decoded).toContain("Total: R$ 43,90");

    expect(decoded).toContain("Rua Dev 25");

    expect(decoded).not.toContain("Observações do pedido");

    expect(state.getCart()).toEqual([]);
  });

  it("does not open payment or WhatsApp when the API cannot create the order", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    createOrderMock.mockRejectedValue(new Error("API unavailable"));

    const { order, state } = await loadOrderModules();

    state.setCart([
      {
        id: "burger-praiano",
        name: "O Praiano",
        price: 43.9,
        quantity: 1,
      },
    ]);

    state.setOrderType(state.ORDER_TYPES.PICKUP);

    order.bindOrderEvents();

    document.getElementById("go-to-payment-btn").click();

    await vi.advanceTimersByTimeAsync(20);

    expect(createOrderMock).toHaveBeenCalledOnce();

    expect(initializePaymentFormMock).not.toHaveBeenCalled();

    expect(createPaymentMock).not.toHaveBeenCalled();

    expect(processCardPaymentMock).not.toHaveBeenCalled();

    expect(window.open).not.toHaveBeenCalled();

    expect(state.getCart()).toHaveLength(1);

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("creates a new payment with a new idempotency key after a definitive provider rejection", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const randomUUIDMock = vi.fn();

    randomUUIDMock
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");

    vi.stubGlobal("crypto", {
      randomUUID: randomUUIDMock,
    });

    createOrderMock.mockResolvedValue({
      orderId: 102,
      subtotal: 64.7,
      deliveryFee: 0,
      total: 64.7,
    });

    createPaymentMock
      .mockResolvedValueOnce({
        paymentId: 202,
        orderId: 102,
        amount: 64.7,
        status: 1,
      })
      .mockResolvedValueOnce({
        paymentId: 203,
        orderId: 102,
        amount: 64.7,
        status: 1,
      });

    processCardPaymentMock
      .mockRejectedValueOnce({
        status: 422,
        data: {
          code: "payment_provider_rejected",
          error: "The payment provider rejected the request.",
        },
      })
      .mockResolvedValueOnce({
        paymentId: 203,
        orderId: 102,
        amount: 64.7,
        status: 2,
        externalOrderId: "ORDER-RETRY",
        externalPaymentId: "PAYMENT-RETRY",
      });

    const { order, state } = await loadOrderModules();

    state.setCart([
      {
        id: "burger-praiano",
        name: "O Praiano",
        price: 64.7,
        quantity: 1,
      },
    ]);

    state.setOrderType(state.ORDER_TYPES.PICKUP);

    order.bindOrderEvents();

    document.getElementById("go-to-payment-btn").click();

    await vi.advanceTimersByTimeAsync(20);

    expect(createOrderMock).toHaveBeenCalledOnce();

    await paymentSubmitCallback(getCardData("first-card-token"));

    expect(createPaymentMock).toHaveBeenNthCalledWith(
      1,
      102,
      "11111111-1111-4111-8111-111111111111",
    );

    expect(processCardPaymentMock).toHaveBeenNthCalledWith(1, 202, {
      paymentToken: "first-card-token",
      paymentMethodId: "visa",
      installments: 1,
      payerEmail: "teste@testuser.com",
    });

    expect(window.open).not.toHaveBeenCalled();

    await paymentSubmitCallback(getCardData("second-card-token"));

    expect(createOrderMock).toHaveBeenCalledOnce();

    expect(createPaymentMock).toHaveBeenCalledTimes(2);

    expect(createPaymentMock).toHaveBeenNthCalledWith(
      2,
      102,
      "22222222-2222-4222-8222-222222222222",
    );

    expect(processCardPaymentMock).toHaveBeenNthCalledWith(2, 203, {
      paymentToken: "second-card-token",
      paymentMethodId: "visa",
      installments: 1,
      payerEmail: "teste@testuser.com",
    });

    expect(randomUUIDMock).toHaveBeenCalledTimes(2);

    expect(window.open).toHaveBeenCalledOnce();

    expect(state.getCart()).toEqual([]);

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
