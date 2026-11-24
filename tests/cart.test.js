// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const stateMock = vi.hoisted(() => ({
  cart: [],
}));

const serviceMock = vi.hoisted(() => ({
  products: new Map(),
  addProductToCart: vi.fn(),
  decreaseCartItemQuantity: vi.fn(),
  findProductById: vi.fn(),
  getCartItemCount: vi.fn(),
  getCartSubtotal: vi.fn(),
  increaseCartItemQuantity: vi.fn(),
  removeProductFromCart: vi.fn(),
  getDeliveryFee: vi.fn(),
  getCartTotalWithDelivery: vi.fn(),
}));

const uiMock = vi.hoisted(() => ({
  elements: {},
  showToast: vi.fn(),
}));

vi.mock("../scripts/state.js", () => ({
  getCart: () => stateMock.cart,
  setCart: (cart) => {
    stateMock.cart = cart;
  },
}));

vi.mock("../scripts/cart-service.js", () => ({
  addProductToCart: serviceMock.addProductToCart,
  decreaseCartItemQuantity: serviceMock.decreaseCartItemQuantity,
  findProductById: serviceMock.findProductById,
  getCartItemCount: serviceMock.getCartItemCount,
  getCartSubtotal: serviceMock.getCartSubtotal,
  increaseCartItemQuantity: serviceMock.increaseCartItemQuantity,
  removeProductFromCart: serviceMock.removeProductFromCart,
  getDeliveryFee: serviceMock.getDeliveryFee,
  getCartTotalWithDelivery: serviceMock.getCartTotalWithDelivery,
}));

vi.mock("../scripts/i18n.js", () => ({
  getLocalizedEntity: (entity) => ({
    ...entity,
    name: entity.localizedName ?? entity.name,
  }),

  translate: (key, _locale, params = {}) => {
    const translations = {
      "cart.emptyTitle": "Carrinho vazio",
      "cart.emptyDescription": "Adicione produtos ao carrinho",
      "cart.unitPriceSuffix": "cada",
      "cart.remove": "Remover",
      "cart.unitSingular": "unidade",
      "cart.unitPlural": "unidades",
    };

    if (key === "cart.decreaseAria") {
      return `Diminuir ${params.name}`;
    }

    if (key === "cart.increaseAria") {
      return `Aumentar ${params.name}`;
    }

    if (key === "cart.removeAria") {
      return `Remover ${params.name}`;
    }

    if (key === "cart.activeAddAria") {
      return `${params.quantity} ${params.unit} de ${params.name}`;
    }

    if (key === "cart.addAria") {
      return `Adicionar ${params.name}`;
    }

    if (key === "cart.addedToast") {
      return `${params.name} adicionado`;
    }

    return translations[key] ?? key;
  },

  translateItemCount: (count) => `${count} ${count === 1 ? "item" : "itens"}`,
}));

vi.mock("../scripts/utils.js", () => ({
  escapeHTML: (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;"),

  formatPrice: (value) => `R$ ${Number(value).toFixed(2).replace(".", ",")}`,
}));

vi.mock("../scripts/ui.js", () => ({
  elements: uiMock.elements,
  showToast: uiMock.showToast,
}));

function resetElementsMock() {
  for (const key of Object.keys(uiMock.elements)) {
    delete uiMock.elements[key];
  }
}

function setupCartDom() {
  document.body.innerHTML = `
    <div id="cart-items"></div>
    <span id="cart-total"></span>
    <span id="cart-count"></span>
    <span id="cart-item-count-label"></span>

    <button id="go-to-address-btn"></button>
    <button id="cart-btn"></button>

    <button
      type="button"
      class="add-to-cart-btn"
      data-id="burger-1"
    >
      Adicionar

      <span class="product-cart-indicator hidden">
        0
      </span>
    </button>
  `;

  uiMock.elements.cartItemsContainer = document.getElementById("cart-items");

  uiMock.elements.cartTotal = document.getElementById("cart-total");

  uiMock.elements.cartCount = document.getElementById("cart-count");

  uiMock.elements.goToAddressBtn = document.getElementById("go-to-address-btn");

  uiMock.elements.cartBtn = document.getElementById("cart-btn");
}

function setupServiceImplementations() {
  serviceMock.findProductById.mockImplementation((id) => serviceMock.products.get(id) ?? null);

  serviceMock.getCartItemCount.mockImplementation((cart) =>
    cart.reduce((total, item) => total + item.quantity, 0),
  );

  serviceMock.getCartSubtotal.mockImplementation((cart) =>
    cart.reduce((total, item) => total + item.price * item.quantity, 0),
  );

  serviceMock.addProductToCart.mockImplementation((cart, product) => {
    const existingItem = cart.find((item) => item.id === product.id);

    if (existingItem) {
      return cart.map((item) =>
        item.id === product.id
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item,
      );
    }

    return [
      ...cart,
      {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
      },
    ];
  });

  serviceMock.removeProductFromCart.mockImplementation((cart, id) =>
    cart.filter((item) => item.id !== id),
  );

  serviceMock.increaseCartItemQuantity.mockImplementation((cart, id) =>
    cart.map((item) =>
      item.id === id
        ? {
            ...item,
            quantity: item.quantity + 1,
          }
        : item,
    ),
  );

  serviceMock.decreaseCartItemQuantity.mockImplementation((cart, id) =>
    cart
      .map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: item.quantity - 1,
            }
          : item,
      )
      .filter((item) => item.quantity > 0),
  );
}

async function loadCartModule() {
  vi.resetModules();

  return import("../scripts/cart.js");
}

beforeEach(() => {
  stateMock.cart = [];

  serviceMock.products.clear();

  for (const mock of Object.values(serviceMock)) {
    if (typeof mock === "function" && typeof mock.mockReset === "function") {
      mock.mockReset();
    }
  }

  uiMock.showToast.mockReset();

  resetElementsMock();
  setupCartDom();
  setupServiceImplementations();

  vi.useRealTimers();
});

describe("cart", () => {
  it("renders the empty cart state and disables checkout", async () => {
    const cart = await loadCartModule();

    cart.updateCart();

    expect(uiMock.elements.cartItemsContainer.textContent).toContain("Carrinho vazio");

    expect(uiMock.elements.cartTotal.textContent).toBe("R$ 0,00");

    expect(uiMock.elements.cartCount.textContent).toBe("0");

    expect(document.getElementById("cart-item-count-label").textContent).toBe("0 itens");

    expect(uiMock.elements.goToAddressBtn.disabled).toBe(true);

    const button = document.querySelector(".add-to-cart-btn");

    const indicator = button.querySelector(".product-cart-indicator");

    expect(button.classList.contains("btn-add-item-active")).toBe(false);

    expect(indicator.classList.contains("hidden")).toBe(true);
  });

  it("renders cart items with localized product information", async () => {
    serviceMock.products.set("burger-1", {
      id: "burger-1",
      name: "Burger Original",
      localizedName: "Burger Localizado",
      price: 20,
    });

    stateMock.cart = [
      {
        id: "burger-1",
        name: "Burger Original",
        price: 20,
        quantity: 2,
      },
    ];

    const cart = await loadCartModule();

    cart.updateCart();

    expect(document.querySelector(".cart-item-name").textContent).toBe("Burger Localizado");

    expect(document.querySelector(".cart-item-unit-price").textContent).toContain("R$ 20,00");

    expect(document.querySelector(".cart-item-subtotal").textContent).toBe("R$ 40,00");

    expect(uiMock.elements.cartTotal.textContent).toBe("R$ 40,00");

    expect(uiMock.elements.cartCount.textContent).toBe("2");

    expect(uiMock.elements.goToAddressBtn.disabled).toBe(false);

    const button = document.querySelector(".add-to-cart-btn");

    const indicator = button.querySelector(".product-cart-indicator");

    expect(button.classList.contains("btn-add-item-active")).toBe(true);

    expect(indicator.textContent).toBe("2");

    expect(indicator.classList.contains("hidden")).toBe(false);

    expect(button.getAttribute("aria-label")).toContain("2 unidades");
  });

  it("uses the cart item data when the product no longer exists in the catalog", async () => {
    stateMock.cart = [
      {
        id: "legacy-product",
        name: "Produto Legado",
        price: 15,
        quantity: 1,
      },
    ];

    const cart = await loadCartModule();

    cart.updateCart();

    expect(document.querySelector(".cart-item-name").textContent).toBe("Produto Legado");

    expect(document.querySelector(".cart-item-subtotal").textContent).toBe("R$ 15,00");
  });

  it("updates product buttons even when the cart modal elements are unavailable", async () => {
    serviceMock.products.set("burger-1", {
      id: "burger-1",
      name: "Burger",
      price: 20,
    });

    stateMock.cart = [
      {
        id: "burger-1",
        name: "Burger",
        price: 20,
        quantity: 1,
      },
    ];

    uiMock.elements.cartItemsContainer = null;
    uiMock.elements.cartTotal = null;
    uiMock.elements.cartCount = null;

    const cart = await loadCartModule();

    expect(() => cart.updateCart()).not.toThrow();

    const button = document.querySelector(".add-to-cart-btn");

    expect(button.classList.contains("btn-add-item-active")).toBe(true);

    expect(button.querySelector(".product-cart-indicator").textContent).toBe("1");
  });

  it("handles increase, decrease and removal controls", async () => {
    stateMock.cart = [
      {
        id: "burger-1",
        name: "Burger",
        price: 20,
        quantity: 1,
      },
    ];

    serviceMock.products.set("burger-1", {
      id: "burger-1",
      name: "Burger",
      price: 20,
    });

    const cart = await loadCartModule();

    cart.updateCart();
    cart.bindCartControls();

    uiMock.elements.cartItemsContainer.querySelector(".plus-btn").click();

    expect(serviceMock.increaseCartItemQuantity).toHaveBeenCalledOnce();

    expect(stateMock.cart[0].quantity).toBe(2);

    uiMock.elements.cartItemsContainer.querySelector(".minus-btn").click();

    expect(serviceMock.decreaseCartItemQuantity).toHaveBeenCalledOnce();

    expect(stateMock.cart[0].quantity).toBe(1);

    uiMock.elements.cartItemsContainer.querySelector(".remove-btn").click();

    expect(serviceMock.removeProductFromCart).toHaveBeenCalledOnce();

    expect(stateMock.cart).toEqual([]);

    expect(uiMock.elements.cartItemsContainer.textContent).toContain("Carrinho vazio");
  });

  it("does not bind cart controls when the cart container is unavailable", async () => {
    uiMock.elements.cartItemsContainer = null;

    const cart = await loadCartModule();

    expect(() => cart.bindCartControls()).not.toThrow();
  });

  it("adds products through delegated click events and handles unknown products", async () => {
    vi.useFakeTimers();

    serviceMock.products.set("burger-1", {
      id: "burger-1",
      name: "Burger Original",
      localizedName: "Burger Localizado",
      price: 25,
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const cart = await loadCartModule();

    cart.bindAddToCartButtons();

    const button = document.querySelector(".add-to-cart-btn");

    button.click();

    expect(serviceMock.addProductToCart).toHaveBeenCalledOnce();

    expect(stateMock.cart).toEqual([
      {
        id: "burger-1",
        name: "Burger Original",
        price: 25,
        quantity: 1,
      },
    ]);

    expect(uiMock.showToast).toHaveBeenCalledWith("Burger Localizado adicionado", "#ffd340");

    expect(button.classList.contains("scale-110")).toBe(true);

    expect(uiMock.elements.cartBtn.classList.contains("scale-105")).toBe(true);

    await vi.advanceTimersByTimeAsync(250);

    expect(button.classList.contains("scale-110")).toBe(false);

    expect(uiMock.elements.cartBtn.classList.contains("scale-105")).toBe(false);

    button.dataset.id = "produto-inexistente";
    button.click();

    expect(consoleError).toHaveBeenCalledWith(
      "Produto não encontrado no cardápio: produto-inexistente",
    );

    expect(serviceMock.addProductToCart).toHaveBeenCalledOnce();

    consoleError.mockRestore();
  });
});
