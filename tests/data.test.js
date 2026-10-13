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

    const previousCrownName = crown.name;
    const previousCrownDescription = crown.description;
    const previousCrownEnglishName = crown.translations["en-US"].name;
    const previousCrownEnglishDescription = crown.translations["en-US"].description;
    const previousPraianoName = praiano.name;
    const previousPraianoDescription = praiano.description;
    const previousPraianoEnglishDescription = praiano.translations["en-US"].description;
    const previousCrownPrice = crown.price;
    const previousCrownActive = crown.isActive;
    const previousPraianoActive = praiano.isActive;

    try {
      applyPublicCatalog([
        {
          code: "burger-joia-da-coroa",
          name: "Joia da Coroa Especial",
          description: "Descrição atualizada pelo Admin.",
          price: 59.9,
          isActive: true,
        },
        {
          code: "burger-praiano",
          name: "O Praiano",
          description: "Descrição atualizada para teste.",
          price: 43.9,
          isActive: false,
        },
      ]);

      expect(crown.name).toBe("Joia da Coroa Especial");
      expect(crown.description).toBe("Descrição atualizada pelo Admin.");
      expect(crown.translations["en-US"].name).toBe("Joia da Coroa Especial");
      expect(crown.translations["en-US"].description).toBe("Descrição atualizada pelo Admin.");
      expect(praiano.translations["en-US"].name).toBe("The Beach Burger");
      expect(praiano.translations["en-US"].description).toBe("Descrição atualizada para teste.");
      expect(crown.price).toBe(59.9);
      expect(crown.isActive).toBe(true);
      expect(praiano.isActive).toBe(false);
    } finally {
      crown.name = previousCrownName;
      crown.description = previousCrownDescription;
      crown.translations["en-US"].name = previousCrownEnglishName;
      crown.translations["en-US"].description = previousCrownEnglishDescription;
      praiano.name = previousPraianoName;
      praiano.description = previousPraianoDescription;
      praiano.translations["en-US"].description = previousPraianoEnglishDescription;
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
