import type { CatalogProduct } from "@/features/catalog/catalog";
import type { CartItem } from "./cart";

export const CART_KEY = "burger-house-cart-v2";

export function readCart(): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((item) => {
      if (
        !item ||
        typeof item.code !== "string" ||
        !item.code ||
        seen.has(item.code) ||
        typeof item.name !== "string" ||
        typeof item.price !== "number" ||
        !Number.isFinite(item.price) ||
        item.price < 0 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      )
        return [];
      seen.add(item.code);
      // A saved availability flag never authorizes a purchase after reload.
      return [{ ...item, id: item.code, available: false } as CartItem];
    });
  } catch {
    return [];
  }
}

export function reconcileCart(items: CartItem[], catalog: CatalogProduct[]): CartItem[] {
  const byCode = new Map(catalog.filter((p) => p.code).map((p) => [p.code, p]));
  return items.flatMap((item) => {
    const product = byCode.get(item.code);
    if (!product?.available) return [];
    return [
      {
        ...item,
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        imageAlt: product.imageAlt,
        available: true,
      },
    ];
  });
}

export function cartChanged(items: CartItem[], next: CartItem[]) {
  return (
    JSON.stringify(items.map(({ code, price, quantity }) => ({ code, price, quantity }))) !==
    JSON.stringify(next.map(({ code, price, quantity }) => ({ code, price, quantity })))
  );
}
