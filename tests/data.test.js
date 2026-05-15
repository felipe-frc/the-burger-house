import { describe, expect, it } from "vitest";
import {
  MENU_CATEGORIES,
  MENU_PRODUCT_BY_ID,
  MENU_PRODUCTS,
} from "../scripts/data.js";

describe("menu data", () => {
  it("has menu categories with products", () => {
    expect(MENU_CATEGORIES.length).toBeGreaterThan(0);
    expect(MENU_PRODUCTS.length).toBeGreaterThan(0);
  });

  it("keeps product ids unique", () => {
    const ids = MENU_PRODUCTS.map((product) => product.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it("has valid product data", () => {
    MENU_PRODUCTS.forEach((product) => {
      expect(product.id).toBeTruthy();
      expect(product.name).toBeTruthy();
      expect(product.description).toBeTruthy();
      expect(product.price).toBeGreaterThan(0);
      expect(product.image).toBeTruthy();
      expect(product.imageAlt).toBeTruthy();
    });
  });

  it("maps every product by id", () => {
    MENU_PRODUCTS.forEach((product) => {
      expect(MENU_PRODUCT_BY_ID.get(product.id)).toEqual(product);
    });
  });
});