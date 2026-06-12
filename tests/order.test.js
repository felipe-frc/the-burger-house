// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function normalizeCurrency(value) {
  return value.replace(/\u00A0/g, " ");
}

function setupOrderDom() {
  document.body.innerHTML = `
    <div id="cart-modal" class="hidden"></div>
    <div id="address-modal" class="hidden"></div>
    <div id="review-modal" class="hidden"></div>

    <button id="cart-btn"></button>
    <button id="close-modal-btn"></button>
    <button id="go-to-address-btn"></button>
    <button id="back-to-cart-btn"></button>
    <button id="go-to-review-btn"></button>
    <button id="back-to-address-btn"></button>
    <button id="finish-order-btn"><span>Finalizar</span></button>

    <div id="cart-items"></div>
    <div id="cart-total"></div>
    <div id="cart-count"></div>
    <div id="cart-item-count-label"></div>

    <div id="review-items"></div>
    <div id="review-address"></div>
    <div id="review-total"></div>

    <div id="delivery-fields"></div>
    <div id="pickup-info" class="hidden"></div>
    <p id="address-warn" class="hidden"></p>
    <span id="cep-loading" class="hidden"></span>

    <input id="cep" />
    <input id="street" />
    <input id="neighborhood" />
    <input id="city" />
    <input id="house-number" />
    <input id="complement" />
    <textarea id="order-notes"></textarea>

    <input type="radio" id="order-type-delivery" name="order-type" value="delivery" checked />
    <input type="radio" id="order-type-pickup" name="order-type" value="pickup" />
  `;
}

async function loadOrderModules() {
  vi.resetModules();
  const order = await import("../scripts/order.js");
  const state = await import("../scripts/state.js");
  return { order, state };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T20:00:00"));
  vi.restoreAllMocks();
  localStorage.clear();
  setupOrderDom();
  vi.stubGlobal(
    "Toastify",
    vi.fn(() => ({
      showToast: vi.fn(),
    }))
  );
  window.open = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("order", () => {
  it("builds the WhatsApp message with delivery total and notes", async () => {
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

    document.getElementById("cep").value = "38400-000";
    document.getElementById("street").value = "Rua dos Testes";
    document.getElementById("neighborhood").value = "Centro";
    document.getElementById("city").value = "Uberlândia";
    document.getElementById("house-number").value = "123";
    document.getElementById("complement").value = "Apto 101";
    document.getElementById("order-notes").value = "Sem cebola.";

    order.bindOrderEvents();
    document.getElementById("finish-order-btn").click();

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

    await vi.advanceTimersByTimeAsync(900);

    expect(state.getCart()).toEqual([]);
    expect(document.getElementById("order-notes").value).toBe("");
  });

  it("builds the WhatsApp message for pickup without delivery fee", async () => {
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
    document.getElementById("finish-order-btn").click();

    expect(window.open).toHaveBeenCalledOnce();

    const [url] = window.open.mock.calls[0];
    const decoded = normalizeCurrency(decodeURIComponent(url));

    expect(decoded).toContain("Tipo de pedido");
    expect(decoded).toContain("Retirada no local");
    expect(decoded).toContain("Taxa de entrega: R$ 0,00");
    expect(decoded).toContain("Total: R$ 43,90");
    expect(decoded).toContain("Rua Dev 25");
    expect(decoded).not.toContain("Observações do pedido");
  });
});
