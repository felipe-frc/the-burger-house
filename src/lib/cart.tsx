import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CatalogProduct } from "@/features/catalog/catalog";
import { CART_KEY, readCart, reconcileCart } from "./cart-state";

import type { CartItem, CartProduct } from "../../shared/storefront/lib/cart-types";
export type { CartItem, CartProduct } from "../../shared/storefront/lib/cart-types";

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (product: CartProduct) => void;
  increment: (id: string) => void;
  decrement: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  complete: (paid: Pick<CartItem, "code" | "quantity">[]) => void;
  reconcile: (catalog: CatalogProduct[]) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      /* The cart remains usable when storage is unavailable. */
    }
  }, [items, hydrated]);

  const reconcile = useCallback((catalog: CatalogProduct[]) => {
    setItems((current) => reconcileCart(current, catalog));
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((total, item) => total + item.quantity, 0),
      subtotal:
        items.reduce(
          (total, item) =>
            total + (item.available ? Math.round(item.price * 100) * item.quantity : 0),
          0,
        ) / 100,
      add: (product) =>
        setItems((current) => {
          if (!product.available) return current;
          const existing = current.find((item) => item.id === product.id);
          return existing
            ? current.map((item) =>
                item.id === product.id
                  ? { ...item, quantity: Math.min(99, item.quantity + 1), available: true }
                  : item,
              )
            : [...current, { ...product, quantity: 1 }];
        }),
      increment: (id) =>
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item,
          ),
        ),
      decrement: (id) =>
        setItems((current) =>
          current.flatMap((item) =>
            item.id !== id
              ? [item]
              : item.quantity > 1
                ? [{ ...item, quantity: item.quantity - 1 }]
                : [],
          ),
        ),
      remove: (id) => setItems((current) => current.filter((item) => item.id !== id)),
      clear: () => setItems([]),
      complete: (paid) =>
        setItems((current) =>
          current.flatMap((item) => {
            const purchased = paid
              .filter((p) => p.code === item.code)
              .reduce((sum, p) => sum + p.quantity, 0);
            const remaining = item.quantity - purchased;
            return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
          }),
        ),
      reconcile,
    }),
    [items, reconcile],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
