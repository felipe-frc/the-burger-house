import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

let addProductToCart;
let decreaseCartItemQuantity;
let findProductById;
let getCartItemCount;
let getCartSubtotal;
let getCartTotalWithDelivery;
let getDeliveryFee;
let increaseCartItemQuantity;
let removeProductFromCart;
let DELIVERY_FEE;
let ORDER_TYPES;

const burger = {
  id: "burger-praiano",
  name: "O Praiano",
  price: 43.9,
};

const fries = {
  id: "side-fritas-cheddar",
  name: "Fritas Cheddar & Bacon",
  price: 24.9,
};

beforeAll(async () => {
  const cartService = await import("../scripts/cart-service.js");
  const config = await import("../scripts/config.js");
  const state = await import("../scripts/state.js");

  addProductToCart = cartService.addProductToCart;
  decreaseCartItemQuantity = cartService.decreaseCartItemQuantity;
  findProductById = cartService.findProductById;
  getCartItemCount = cartService.getCartItemCount;
  getCartSubtotal = cartService.getCartSubtotal;
  getCartTotalWithDelivery = cartService.getCartTotalWithDelivery;
  getDeliveryFee = cartService.getDeliveryFee;
  increaseCartItemQuantity = cartService.increaseCartItemQuantity;
  removeProductFromCart = cartService.removeProductFromCart;

  DELIVERY_FEE = config.DELIVERY_FEE;
  ORDER_TYPES = state.ORDER_TYPES;
});

beforeEach(() => {
  localStorage.clear();
});

describe("cart-service", () => {
  it("deve encontrar um produto pelo id", () => {
    const product = findProductById("burger-praiano");

    expect(product).toBeDefined();
    expect(product.id).toBe("burger-praiano");
    expect(product.name).toBe("O Praiano");
  });

  it("deve adicionar um produto ao carrinho vazio", () => {
    const updatedCart = addProductToCart([], burger);

    expect(updatedCart).toEqual([
      {
        id: "burger-praiano",
        name: "O Praiano",
        price: 43.9,
        quantity: 1,
      },
    ]);
  });

  it("deve aumentar a quantidade ao adicionar um produto repetido", () => {
    const cart = [
      {
        id: "burger-praiano",
        name: "O Praiano",
        price: 43.9,
        quantity: 1,
      },
    ];

    const updatedCart = addProductToCart(cart, burger);

    expect(updatedCart[0].quantity).toBe(2);
  });

  it("não deve alterar o carrinho ao adicionar produto inválido", () => {
    const cart = [
      {
        id: "burger-praiano",
        name: "O Praiano",
        price: 43.9,
        quantity: 1,
      },
    ];

    const updatedCart = addProductToCart(cart, null);

    expect(updatedCart).toEqual(cart);
  });

  it("deve remover um produto do carrinho", () => {
    const cart = [
      {
        ...burger,
        quantity: 1,
      },
      {
        ...fries,
        quantity: 1,
      },
    ];

    const updatedCart = removeProductFromCart(cart, "burger-praiano");

    expect(updatedCart).toEqual([
      {
        ...fries,
        quantity: 1,
      },
    ]);
  });

  it("deve aumentar a quantidade de um item", () => {
    const cart = [
      {
        ...burger,
        quantity: 1,
      },
    ];

    const updatedCart = increaseCartItemQuantity(cart, "burger-praiano");

    expect(updatedCart[0].quantity).toBe(2);
  });

  it("deve diminuir a quantidade de um item", () => {
    const cart = [
      {
        ...burger,
        quantity: 2,
      },
    ];

    const updatedCart = decreaseCartItemQuantity(cart, "burger-praiano");

    expect(updatedCart[0].quantity).toBe(1);
  });

  it("deve remover o item quando a quantidade chegar a zero", () => {
    const cart = [
      {
        ...burger,
        quantity: 1,
      },
    ];

    const updatedCart = decreaseCartItemQuantity(cart, "burger-praiano");

    expect(updatedCart).toEqual([]);
  });

  it("deve calcular o subtotal do carrinho", () => {
    const cart = [
      {
        ...burger,
        quantity: 2,
      },
      {
        ...fries,
        quantity: 1,
      },
    ];

    expect(getCartSubtotal(cart)).toBeCloseTo(112.7);
  });

  it("deve calcular a quantidade total de itens", () => {
    const cart = [
      {
        ...burger,
        quantity: 2,
      },
      {
        ...fries,
        quantity: 3,
      },
    ];

    expect(getCartItemCount(cart)).toBe(5);
  });

  it("deve cobrar taxa de entrega quando for delivery e houver itens", () => {
    const cart = [
      {
        ...burger,
        quantity: 1,
      },
    ];

    expect(getDeliveryFee(cart, ORDER_TYPES.DELIVERY)).toBe(DELIVERY_FEE);
  });

  it("não deve cobrar taxa de entrega com carrinho vazio", () => {
    expect(getDeliveryFee([], ORDER_TYPES.DELIVERY)).toBe(0);
  });

  it("não deve cobrar taxa de entrega para retirada", () => {
    const cart = [
      {
        ...burger,
        quantity: 1,
      },
    ];

    expect(getDeliveryFee(cart, ORDER_TYPES.PICKUP)).toBe(0);
  });

  it("deve calcular o total com entrega", () => {
    const cart = [
      {
        ...burger,
        quantity: 1,
      },
      {
        ...fries,
        quantity: 1,
      },
    ];

    expect(getCartTotalWithDelivery(cart, ORDER_TYPES.DELIVERY)).toBeCloseTo(
      73.8
    );
  });

  it("deve calcular o total sem entrega para retirada", () => {
    const cart = [
      {
        ...burger,
        quantity: 1,
      },
      {
        ...fries,
        quantity: 1,
      },
    ];

    expect(getCartTotalWithDelivery(cart, ORDER_TYPES.PICKUP)).toBeCloseTo(
      68.8
    );
  });
});