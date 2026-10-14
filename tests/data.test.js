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

  it("keeps category translations and product image metadata", () => {
    MENU_CATEGORIES.forEach((category) => {
      expect(category.translations?.["en-US"]?.title).toBeTruthy();
      expect(category.translations?.["en-US"]?.subtitle).toBeTruthy();

      category.items.forEach((product) => {
        expect(product.translations?.["en-US"]?.imageAlt).toBeTruthy();
      });
    });
  });

  it("does not require static English product names or descriptions", () => {
    const praiano = MENU_PRODUCT_BY_ID.get("burger-praiano");

    expect(praiano).toBeDefined();

    // Os textos em ingles devem chegar pela API.
    // Nao devem existir traducoes antigas obrigatorias.
    expect(praiano.translations["en-US"].name).toBeUndefined();
    expect(praiano.translations["en-US"].description).toBeUndefined();
  });

  it("uses backend translations, prices and availability", () => {
    const crown = MENU_PRODUCT_BY_ID.get("burger-joia-da-coroa");
    const praiano = MENU_PRODUCT_BY_ID.get("burger-praiano");

    const original = [
      {
        product: crown,
        name: crown.name,
        description: crown.description,
        englishName: crown.translations["en-US"].name,
        englishDescription: crown.translations["en-US"].description,
        price: crown.price,
        isActive: crown.isActive,
      },
      {
        product: praiano,
        name: praiano.name,
        description: praiano.description,
        englishName: praiano.translations["en-US"].name,
        englishDescription: praiano.translations["en-US"].description,
        price: praiano.price,
        isActive: praiano.isActive,
      },
    ];

    try {
      applyPublicCatalog([
        {
          code: "burger-joia-da-coroa",
          name: "Joia da Coroa Especial",
          description: "Descricao atualizada pelo Admin.",
          englishName: "Special Crown Jewel",
          englishDescription: "Updated description from Azure.",
          price: 59.9,
          isActive: true,
        },
        {
          code: "burger-praiano",
          name: "O Praiano",
          description: "Descricao atualizada para teste.",
          englishName: "The Beachgoer",
          englishDescription: "Updated description for testing.",
          price: 43.9,
          isActive: false,
        },
      ]);

      expect(crown.name).toBe("Joia da Coroa Especial");
      expect(crown.description).toBe("Descricao atualizada pelo Admin.");
      expect(crown.translations["en-US"].name).toBe(
        "Special Crown Jewel"
      );
      expect(crown.translations["en-US"].description).toBe(
        "Updated description from Azure."
      );

      expect(praiano.translations["en-US"].name).toBe(
        "The Beachgoer"
      );
      expect(praiano.translations["en-US"].description).toBe(
        "Updated description for testing."
      );

      expect(crown.price).toBe(59.9);
      expect(crown.isActive).toBe(true);
      expect(praiano.isActive).toBe(false);
    } finally {
      original.forEach((snapshot) => {
        const product = snapshot.product;

        product.name = snapshot.name;
        product.description = snapshot.description;
        product.translations["en-US"].name =
          snapshot.englishName;
        product.translations["en-US"].description =
          snapshot.englishDescription;
        product.price = snapshot.price;

        if (snapshot.isActive === undefined) {
          delete product.isActive;
        } else {
          product.isActive = snapshot.isActive;
        }
      });
    }
  });

  it("falls back to Portuguese when translation is missing", () => {
    const praiano = MENU_PRODUCT_BY_ID.get("burger-praiano");

    const previous = {
      name: praiano.name,
      description: praiano.description,
      englishName: praiano.translations["en-US"].name,
      englishDescription:
        praiano.translations["en-US"].description,
      isActive: praiano.isActive,
    };

    try {
      applyPublicCatalog([
        {
          code: "burger-praiano",
          name: "O Praiano",
          description: "Descricao em portugues.",
          englishName: "",
          englishDescription: "",
          price: 43.9,
          isActive: true,
        },
      ]);

      expect(praiano.translations["en-US"].name).toBe(
        "O Praiano"
      );

      expect(praiano.translations["en-US"].description).toBe(
        "Descricao em portugues."
      );
    } finally {
      praiano.name = previous.name;
      praiano.description = previous.description;

      praiano.translations["en-US"].name =
        previous.englishName;

      praiano.translations["en-US"].description =
        previous.englishDescription;

      if (previous.isActive === undefined) {
        delete praiano.isActive;
      } else {
        praiano.isActive = previous.isActive;
      }
    }
  });

  it("maps every product by id", () => {
    MENU_PRODUCTS.forEach((product) => {
      expect(MENU_PRODUCT_BY_ID.get(product.id)).toEqual(product);
    });
  });
});