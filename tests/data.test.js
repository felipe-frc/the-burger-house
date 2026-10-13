import { describe, expect, it } from "vitest";
import {
  applyPublicCatalog,
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

  it("has English translations for categories and products", () => {
    MENU_CATEGORIES.forEach((category) => {
      expect(category.translations?.["en-US"]?.title).toBeTruthy();
      expect(category.translations?.["en-US"]?.subtitle).toBeTruthy();

      category.items.forEach((product) => {
        expect(product.translations?.["en-US"]?.name).toBeTruthy();
        expect(product.translations?.["en-US"]?.description).toBeTruthy();
        expect(product.translations?.["en-US"]?.imageAlt).toBeTruthy();
      });
    });
  });

  it("applies backend price and availability to static menu metadata", () => {
    const crown = MENU_PRODUCT_BY_ID.get("burger-joia-da-coroa");
    const praiano = MENU_PRODUCT_BY_ID.get("burger-praiano");

    const previousCrownPrice = crown.price;
    const previousCrownActive = crown.isActive;
    const previousPraianoActive = praiano.isActive;

    try {
      applyPublicCatalog([
        {
          code: "burger-joia-da-coroa",
          price: 59.9,
          isActive: true,
        },
        {
          code: "burger-praiano",
          price: 43.9,
          isActive: false,
        },
      ]);

      expect(crown.price).toBe(59.9);
      expect(crown.isActive).toBe(true);
      expect(praiano.isActive).toBe(false);
    } finally {
      crown.price = previousCrownPrice;
      crown.isActive = previousCrownActive;
      praiano.isActive = previousPraianoActive;

      MENU_PRODUCTS.forEach((product) => {
        if (product.isActive === false && product !== praiano) {
          delete product.isActive;
        }
      });
    }
  });
  it("maps every product by id", () => {
    MENU_PRODUCTS.forEach((product) => {
      expect(MENU_PRODUCT_BY_ID.get(product.id)).toEqual(product);
    });
  });
});
