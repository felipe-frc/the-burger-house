// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createOrderMock,
  createPaymentMock,
  processCardPaymentMock,
  processPixPaymentMock,
  getPaymentStatusMock,
  initializePaymentFormMock,
  unmountPaymentFormMock,
} = vi.hoisted(() => ({
  createOrderMock: vi.fn(),
  createPaymentMock: vi.fn(),
  processCardPaymentMock: vi.fn(),
  processPixPaymentMock: vi.fn(),
  getPaymentStatusMock: vi.fn(),
  initializePaymentFormMock: vi.fn(),
  unmountPaymentFormMock: vi.fn(),
}));

vi.mock("../scripts/api.js", () => ({
  createOrder: createOrderMock,

  createPayment: createPaymentMock,

  processCardPayment: processCardPaymentMock,

  processPixPayment: processPixPaymentMock,

  getPaymentStatus: getPaymentStatusMock,
}));

vi.mock("../scripts/payment.js", () => ({
  initializePaymentForm: initializePaymentFormMock,

  unmountPaymentForm: unmountPaymentFormMock,
}));

function setupDom() {
  document.body.innerHTML = `
    <div
      id="cart-modal"
      class="hidden"
    ></div>

    <div
      id="address-modal"
      class="hidden"
    ></div>

    <div
      id="review-modal"
      class="hidden"
    ></div>

    <div
      id="payment-modal"
      class="hidden"
    >
      <p class="cart-modal-subtitle">
        Pagamento
      </p>

      <div>
        <i class="fa fa-lock"></i>
      </div>

      <form id="form-checkout">
        <div
          id="form-checkout__cardNumber"
        ></div>

        <input
          id="form-checkout__cardholderName"
        />

        <div
          id="form-checkout__expirationDate"
        ></div>

        <div
          id="form-checkout__securityCode"
        ></div>

        <select
          id="form-checkout__identificationType"
        ></select>

        <input
          id="form-checkout__identificationNumber"
        />

        <input
          id="form-checkout__cardholderEmail"
        />

        <div>
          <select
            id="form-checkout__installments"
          ></select>
        </div>

        <select
          id="form-checkout__issuer"
        ></select>

        <p
          id="payment-error"
          class="hidden"
        ></p>

        <progress
          id="payment-progress"
          class="hidden"
        ></progress>
      </form>

      <button
        id="form-checkout__submit"
        type="submit"
        form="form-checkout"
      >
        Pagar
      </button>

      <div id="payment-total"></div>

      <button
        id="back-to-review-btn"
      ></button>
    </div>

    <button
      id="cart-btn"
    ></button>

    <button
      id="close-modal-btn"
    ></button>

    <button
      id="go-to-address-btn"
    ></button>

    <button
      id="back-to-cart-btn"
    ></button>

    <button
      id="go-to-review-btn"
    ></button>

    <button
      id="back-to-address-btn"
    ></button>

    <button
      id="go-to-payment-btn"
    ></button>

    <div id="cart-items"></div>
    <div id="cart-total"></div>
    <div id="cart-count"></div>

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

    <textarea
      id="order-notes"
    ></textarea>

    <input
      type="radio"
      id="order-type-delivery"
      name="order-type"
      value="delivery"
    />

    <input
      type="radio"
      id="order-type-pickup"
      name="order-type"
      value="pickup"
      checked
    />
  `;
}

beforeEach(() => {
  vi.useFakeTimers();

  vi.setSystemTime(new Date("2026-01-01T20:00:00"));

  vi.resetModules();

  vi.restoreAllMocks();

  vi.clearAllMocks();

  setupDom();

  localStorage.clear();

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

  createOrderMock.mockResolvedValue({
    orderId: 100,
    subtotal: 43.9,
    deliveryFee: 0,
    total: 43.9,
  });

  createPaymentMock.mockResolvedValue({
    paymentId: 200,
    orderId: 100,
    amount: 43.9,
    status: 1,
    method: 1,
  });

  processPixPaymentMock.mockResolvedValue({
    paymentId: 200,
    orderId: 100,
    amount: 43.9,
    status: 1,

    qrCode: "000201PIXTEST",

    qrCodeBase64: "ABC123",

    ticketUrl: "https://www.mercadopago.com.br/test",
  });

  getPaymentStatusMock
    .mockResolvedValueOnce({
      paymentId: 200,
      status: 1,
      method: 1,
      amount: 43.9,
    })
    .mockResolvedValueOnce({
      paymentId: 200,
      status: 2,
      method: 1,
      amount: 43.9,
    });

  initializePaymentFormMock.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

async function startPixCheckout() {
  const order = await import("../scripts/order.js");

  const state = await import("../scripts/state.js");

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

  const pixInput = document.querySelector("input[name='payment-method'][value='1']");

  pixInput.checked = true;
  pixInput.dispatchEvent(new Event("change", { bubbles: true }));

  await vi.advanceTimersByTimeAsync(20);

  document.getElementById("pix-payer-email").value = "cliente@email.com";
  document.getElementById("generate-pix-btn").click();

  await vi.advanceTimersByTimeAsync(20);

  return state;
}

describe("Pix payment polling", () => {
  it("confirms the order only after the backend reports Approved", async () => {
    const state = await startPixCheckout();

    expect(createPaymentMock).toHaveBeenCalledWith(100, "11111111-1111-4111-8111-111111111111", 1);

    expect(processPixPaymentMock).toHaveBeenCalledWith(200, {
      payerEmail: "cliente@email.com",
    });

    expect(window.open).not.toHaveBeenCalled();

    expect(document.getElementById("pix-copy-code").value).toBe("000201PIXTEST");

    await vi.advanceTimersByTimeAsync(3000);

    expect(getPaymentStatusMock).toHaveBeenCalledTimes(1);

    expect(window.open).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    expect(getPaymentStatusMock).toHaveBeenCalledTimes(2);

    expect(window.open).toHaveBeenCalledOnce();

    expect(state.getCart()).toEqual([]);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows Pending instructions without opening WhatsApp", async () => {
    getPaymentStatusMock.mockReset().mockResolvedValue({
      paymentId: 200,
      status: 1,
      method: 1,
      amount: 43.9,
    });

    await startPixCheckout();

    expect(document.getElementById("pix-instructions").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("pix-status").textContent).toContain("Aguardando");
    expect(window.open).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);

    expect(window.open).not.toHaveBeenCalled();
  });

  it.each([
    [3, "recusado"],
    [4, "cancelado"],
  ])("stops polling for terminal status %s without opening WhatsApp", async (status, message) => {
    getPaymentStatusMock.mockReset().mockResolvedValue({
      paymentId: 200,
      status,
      method: 1,
      amount: 43.9,
    });

    await startPixCheckout();
    await vi.advanceTimersByTimeAsync(3000);

    expect(window.open).not.toHaveBeenCalled();
    expect(document.getElementById("payment-error").textContent.toLowerCase()).toContain(message);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops after timeout and informs the customer", async () => {
    getPaymentStatusMock.mockReset().mockResolvedValue({
      paymentId: 200,
      status: 1,
      method: 1,
      amount: 43.9,
    });

    await startPixCheckout();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    expect(window.open).not.toHaveBeenCalled();
    expect(document.getElementById("payment-error").textContent).toContain(
      "Ainda não recebemos a confirmação do PIX",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries an unavailable provider with the same local payment", async () => {
    processPixPaymentMock
      .mockRejectedValueOnce({
        status: 502,
        data: { code: "payment_provider_unavailable" },
      })
      .mockResolvedValueOnce({
        paymentId: 200,
        orderId: 100,
        amount: 43.9,
        status: 1,
        qrCode: "000201PIXTEST",
      });

    await startPixCheckout();

    const button = document.getElementById("generate-pix-btn");

    expect(button.disabled).toBe(false);

    button.click();
    await vi.advanceTimersByTimeAsync(20);

    expect(createPaymentMock).toHaveBeenCalledOnce();
    expect(processPixPaymentMock).toHaveBeenCalledTimes(2);
    expect(processPixPaymentMock.mock.calls[1][0]).toBe(200);
  });

  it("ignores a double click while Pix creation is in progress", async () => {
    let resolvePix;

    processPixPaymentMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePix = resolve;
      }),
    );

    await startPixCheckout();

    const button = document.getElementById("generate-pix-btn");

    expect(button.disabled).toBe(true);

    button.click();

    expect(createPaymentMock).toHaveBeenCalledOnce();
    expect(processPixPaymentMock).toHaveBeenCalledOnce();

    resolvePix({
      paymentId: 200,
      orderId: 100,
      amount: 43.9,
      status: 1,
      qrCode: "000201PIXTEST",
    });

    await vi.advanceTimersByTimeAsync(20);
  });
});
