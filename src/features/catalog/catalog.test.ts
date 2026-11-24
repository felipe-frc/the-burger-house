import { describe, expect, it } from "vitest";
import { createFallbackCatalog, mergeCatalog } from "./catalog";
import demoCatalog from "../../../scripts/admin/demo-catalog.json";

describe("approved persistent demonstration identities", () => {
  const products = demoCatalog.products.map(product => ({ ...product, isActive: true }));
  it("maps all fifteen codes and persisted prices without legacy substitution", () => {
    const legacy = { code: "burger-praiano", name: "Burger do teste Owner", description: "Fixture", price: 1, isActive: false };
    const merged = mergeCatalog([legacy, ...products]);
    expect(merged).toHaveLength(15);
    expect(merged.every(product => product.available && product.source === "api")).toBe(true);
    expect(merged.map(product => product.code).sort()).toEqual(products.map(product => product.code).sort());
    for (const product of products) expect(merged.find(item => item.code === product.code)?.price).toBe(product.price);
    expect(merged.filter(product => product.category === "Burgers")).toHaveLength(6);
    expect(merged.filter(product => product.category === "Acompanhamentos")).toHaveLength(3);
    expect(merged.filter(product => product.category === "Bebidas")).toHaveLength(6);
  });
  it("keeps inactive, missing and zero-price demo products unavailable", () => {
    const unavailable = mergeCatalog(products.filter(product => product.code !== "demo-the-classic")
      .map(product => ({ ...product, isActive: product.code !== "demo-double-smash", price: product.code === "demo-smokehouse-bbq" ? 0 : product.price })));
    for (const id of ["the-classic", "double-smash", "smokehouse-bbq"]) {
      expect(unavailable.find(product => product.storefrontId === id)?.available).toBe(false);
    }
  });
});

describe("catalog synchronization", () => {
  it("preserves all 15 designed products while marking missing records unavailable", () => {
    const products = createFallbackCatalog();
    expect(products).toHaveLength(15);
    expect(products.every((product) => !product.available)).toBe(true);
  });

  it("uses API identity, prices and active state for matched products", () => {
    const products = mergeCatalog([
      {
        code: "burger-praiano",
        name: "O Praiano",
        description: "Descrição oficial",
        englishName: "The Beach Burger",
        englishDescription: "Official description",
        price: 49.9,
        isActive: true,
        category: "menu",
        displayOrder: 2,
        imageUrl: null,
      },
      {
        code: "drink-disabled",
        name: "Bebida inativa",
        description: "Não mostrar",
        price: 1,
        isActive: false,
        category: "drinks",
        displayOrder: 1,
      },
    ]);
    const praiano = products.find((product) => product.code === "burger-praiano");
    expect(praiano).toMatchObject({ available: true, price: 49.9, source: "api" });
    expect(products.some((product) => product.code === "drink-disabled")).toBe(false);
  });

  it("excludes active legacy products outside the curated menu", () => {
    const products = mergeCatalog([
      {
        code: "burger-outback-king",
        name: "O Outback King",
        description: "Receita existente",
        price: 43.9,
        isActive: true,
        category: "menu",
        displayOrder: 90,
      },
    ]);

    expect(products).toHaveLength(15);
    expect(products.some((product) => product.code === "burger-outback-king")).toBe(false);
  });

  it("preserves curated images while using API identity and price", () => {
    const products = mergeCatalog([
      {
        code: "burger-praiano",
        name: "O Praiano",
        description: "Descricao oficial",
        price: 49.9,
        isActive: true,
        category: "menu",
        imageUrl: "/uploads/old-praiano.webp",
      },
    ]);

    const praiano = products.find((product) => product.code === "burger-praiano");

    expect(praiano).toMatchObject({
      available: true,
      price: 49.9,
      image: "/assets/produtos/hamburgueres/praiano.webp",
    });
  });

  it("prioritizes stable codes over duplicate or renamed product names", () => {
    const products = mergeCatalog([
      { code: "other", name: "O Praiano", description: "Other", price: 1, isActive: true },
      {
        code: "burger-praiano",
        name: "Nome atualizado",
        description: "Official",
        price: 49.9,
        isActive: false,
      },
    ]);
    expect(products.find((p) => p.code === "burger-praiano")).toMatchObject({
      name: "Nome atualizado",
      price: 49.9,
      available: false,
    });
  });

  it("reflects images changed through the official admin upload endpoint", () => {
    const imageUrl = "/api/product-images/abcdef0123456789abcdef0123456789.webp";
    const products = mergeCatalog([
      {
        code: "burger-praiano",
        name: "O Praiano",
        description: "Official",
        price: 43.9,
        isActive: true,
        imageUrl,
      },
    ]);
    expect(products.find((p) => p.code === "burger-praiano")?.image).toBe(imageUrl);
  });
  it("keeps an admin-created product mapped after a rename without changing its real code", () => {
    const products = mergeCatalog([
      {
        code: "the-classic-012345abcdef",
        name: "Classic da Casa",
        description: "Atualizado",
        price: 38.9,
        isActive: true,
      },
    ]);
    expect(products.find((p) => p.id === "the-classic-012345abcdef")).toMatchObject({
      code: "the-classic-012345abcdef",
      name: "Classic da Casa",
      price: 38.9,
      available: true,
    });
  });
  it("does not guess identity when duplicate generated codes share a planned name", () => {
    const products = mergeCatalog([
      {
        code: "the-classic-012345abcdef",
        name: "Classic A",
        description: "A",
        price: 38.9,
        isActive: true,
      },
      {
        code: "the-classic-abcdef012345",
        name: "Classic B",
        description: "B",
        price: 39.9,
        isActive: true,
      },
    ]);
    expect(products.find((p) => p.id === "the-classic")?.available).toBe(false);
  });
});
