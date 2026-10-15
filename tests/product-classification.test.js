import { beforeEach, expect, it, vi } from "vitest";

let data;
beforeEach(async () => {
  vi.resetModules();
  data = await import("../scripts/data.js");
});
const row = (code, category, displayOrder, extra = {}) => ({
  code,
  category,
  displayOrder,
  name: "Produto",
  description: "Descrição",
  price: 20,
  isActive: true,
  ...extra,
});
const codes = (category) =>
  data.MENU_CATEGORIES.find((c) => c.id === category).items.map((p) => p.id);

it("moves original products between categories while retaining images, objects and translations", () => {
  const original = data.MENU_PRODUCT_BY_ID.get("burger-praiano");
  const image = original.image;
  data.applyPublicCatalog([
    row(original.id, "drinks", 0, {
      englishName: "Beach Burger",
      englishDescription: "English description",
    }),
  ]);
  expect(codes("menu")).not.toContain(original.id);
  expect(codes("drinks")).toEqual([original.id]);
  expect(data.MENU_PRODUCT_BY_ID.get(original.id)).toBe(original);
  expect(original.image).toBe(image);
  expect(original.translations["en-US"].name).toBe("Beach Burger");
  expect(original.name).toBe("Produto");
});

it("orders old and new products by position then code, regardless of response order", () => {
  const rows = [
    row("new-z", "sides", 2),
    row("side-batata-rustica", "sides", 1),
    row("new-a", "sides", 2),
  ];
  data.applyPublicCatalog(rows);
  expect(codes("sides")).toEqual(["side-batata-rustica", "new-a", "new-z"]);
  data.applyPublicCatalog([...rows].reverse());
  expect(codes("sides")).toEqual(["side-batata-rustica", "new-a", "new-z"]);
  expect(data.MENU_PRODUCT_BY_ID.get("new-a").image).toBe("./assets/logo-burger.webp");
});

it("repeated catalog refreshes do not duplicate products or leave stale category references", () => {
  const products = data.MENU_PRODUCTS;
  const categories = data.MENU_CATEGORIES;
  const rows = [row("burger-praiano", "drinks", 3), row("new-a", "sides", 0)];
  for (let i = 0; i < 3; i++) data.applyPublicCatalog([...rows, rows[0]]);
  expect(products).toBe(data.MENU_PRODUCTS);
  expect(categories).toBe(data.MENU_CATEGORIES);
  expect(products).toHaveLength(2);
  expect(categories.map((c) => c.id)).toEqual(["menu", "sides", "drinks"]);
  data.applyPublicCatalog([row("burger-praiano", "menu", 0)]);
  expect(codes("drinks")).toEqual([]);
  expect(codes("sides")).toEqual([]);
  expect(data.MENU_PRODUCT_BY_ID.has("new-a")).toBe(false);
});

it("preserves all eleven original images after moving every original product", () => {
  const images = new Map(data.MENU_PRODUCTS.map((p) => [p.id, p.image]));
  data.applyPublicCatalog([...images.keys()].map((code) => row(code, "drinks", 0)));
  expect(data.MENU_PRODUCTS).toHaveLength(11);
  for (const product of data.MENU_PRODUCTS) expect(product.image).toBe(images.get(product.id));
});

it("keeps inactive products unavailable and falls back to Portuguese without English", () => {
  data.applyPublicCatalog([row("new-a", "drinks", 0, { isActive: false })]);
  const product = data.MENU_PRODUCT_BY_ID.get("new-a");
  expect(product.isActive).toBe(false);
  expect(product.translations["en-US"].name).toBe(product.name);
  expect(data.MENU_PRODUCT_BY_ID.get("burger-praiano").isActive).toBe(false);
});

it("rejects invalid remote classifications instead of corrupting navigation", () => {
  data.applyPublicCatalog([row("a", "unknown", 1), row("b", "menu", -1), row("c", "menu", 1.5)]);
  expect(data.MENU_PRODUCTS).toHaveLength(0);
  expect(data.MENU_CATEGORIES).toHaveLength(3);
});
