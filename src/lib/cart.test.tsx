import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCart, type CartItem } from "./cart";
import { CART_KEY, cartChanged, readCart, reconcileCart } from "./cart-state";
import { mergeCatalog } from "@/features/catalog/catalog";

const product: CartItem = {
  id: "burger-praiano",
  code: "burger-praiano",
  name: "O Praiano",
  price: 43.9,
  quantity: 1,
  image: "/image.webp",
  imageAlt: "Burger",
  available: true,
};
const catalog = mergeCatalog([
  { code: product.code, name: product.name, price: 49.9, description: "Updated", isActive: true },
]);
function Controls() {
  const cart = useCart();
  return (
    <>
      <output data-testid="cart">{JSON.stringify(cart.items)}</output>
      <output data-testid="subtotal">{cart.subtotal}</output>
      <button onClick={() => cart.add(product)}>add</button>
      <button onClick={() => cart.increment(product.id)}>plus</button>
      <button onClick={() => cart.decrement(product.id)}>minus</button>
      <button onClick={() => cart.remove(product.id)}>remove</button>
      <button onClick={() => cart.reconcile(catalog)}>refresh</button>
      <button onClick={() => cart.complete([{ code: product.code, quantity: 1 }])}>paid</button>
    </>
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("persistent cart", () => {
  it("adds, increments, decrements and removes using cents", () => {
    render(
      <CartProvider>
        <Controls />
      </CartProvider>,
    );
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("plus"));
    expect(screen.getByTestId("subtotal")).toHaveTextContent("87.8");
    fireEvent.click(screen.getByText("minus"));
    expect(screen.getByTestId("subtotal")).toHaveTextContent("43.9");
    fireEvent.click(screen.getByText("remove"));
    expect(screen.getByTestId("cart")).toHaveTextContent("[]");
  });
  it("rehydrates persisted items as unverified then updates official prices", () => {
    localStorage.setItem(CART_KEY, JSON.stringify([product]));
    render(
      <CartProvider>
        <Controls />
      </CartProvider>,
    );
    expect(screen.getByTestId("subtotal")).toHaveTextContent("0");
    fireEvent.click(screen.getByText("refresh"));
    expect(screen.getByTestId("subtotal")).toHaveTextContent("49.9");
    expect(JSON.parse(localStorage.getItem(CART_KEY)!)[0].price).toBe(49.9);
  });
  it("removes only purchased quantities when payment completes", () => {
    render(
      <CartProvider>
        <Controls />
      </CartProvider>,
    );
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("paid"));
    expect(screen.getByTestId("subtotal")).toHaveTextContent("43.9");
  });
  it("removes inactive and missing products", () => {
    expect(reconcileCart([product], [])).toEqual([]);
    expect(
      reconcileCart(
        [product],
        catalog.map((p) => ({ ...p, available: false })),
      ),
    ).toEqual([]);
    expect(cartChanged([product], reconcileCart([product], catalog))).toBe(true);
  });
  it("rejects malformed, duplicate and excessive persisted quantities", () => {
    localStorage.setItem(
      CART_KEY,
      JSON.stringify([
        product,
        product,
        { ...product, code: "bad", quantity: 100 },
        { ...product, code: "negative", price: -1 },
      ]),
    );
    expect(readCart()).toHaveLength(1);
    localStorage.setItem(CART_KEY, "broken JSON");
    expect(readCart()).toEqual([]);
  });
  it("remains usable when persistence is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <CartProvider>
        <Controls />
      </CartProvider>,
    );
    await act(async () => fireEvent.click(screen.getByText("add")));
    expect(screen.getByTestId("subtotal")).toHaveTextContent("43.9");
  });
});
