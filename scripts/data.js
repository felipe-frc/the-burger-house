/**
 * @typedef {{id: string, name: string, description: string, price: number, image: string,
 * imageAlt: string, imageUrl?: string | null, tag?: string, isActive?: boolean, category?: string, displayOrder?: number,
 * translations: {"en-US": {imageAlt: string, tag?: string, name?: string, description?: string}}}} MenuProduct
 */
/** @type {Array<{id: string, title: string, icon: string, subtitle: string, translations: {"en-US": {title: string, subtitle: string}}, items: MenuProduct[]}>} */
export const MENU_CATEGORIES = [
  {
    id: "menu",
    title: "Nossos Hambúrgueres",
    icon: "fas fa-burger",
    subtitle: "Combinações irresistíveis de sabor e qualidade",
    translations: {
      "en-US": {
        title: "Our Burgers",
        subtitle: "Irresistible combinations of flavor and quality",
      },
    },
    items: [
      {
        id: "burger-praiano",
        name: "O Praiano",
        description:
          "Queijo coalho grelhado com fio de mel, banana-da-terra frita, bacon crocante e maionese defumada.",
        price: 43.9,
        image: "./assets/praiano-burguer.webp",
        imageAlt:
          "Hambúrguer O Praiano com queijo coalho grelhado, banana-da-terra frita, bacon crocante e maionese defumada.",
        tag: "Mais Pedido",
        translations: {
          "en-US": {
            imageAlt:
              "The Beach Burger with grilled coalho cheese, fried plantain, crispy bacon and smoked mayo.",
            tag: "Best Seller",
          },
        },
      },
      {
        id: "burger-onion-rings",
        name: "O Famoso Onion Ring",
        description:
          "Aioli de alho assado, queijo suíço derretido, bacon e anéis de cebola gigantes crocantes.",
        price: 43.9,
        image: "./assets/onion-rings-burguer.webp",
        imageAlt:
          "Hambúrguer O Famoso Onion Ring com queijo suíço, bacon e anéis de cebola crocantes.",
        tag: "Destaque",
        translations: {
          "en-US": {
            imageAlt:
              "The Famous Onion Ring burger with Swiss cheese, bacon and crispy onion rings.",
            tag: "Featured",
          },
        },
      },
      {
        id: "burger-crispy-chicken-cheddar",
        name: "Crispy Chicken Cheddar",
        description:
          "Filé de frango crocante com cheddar derretido, bacon, alface, tomate e maionese defumada.",
        price: 35.9,
        image: "./assets/crispy-chicken-burguer.webp",
        imageAlt:
          "Hambúrguer Crispy Chicken Cheddar com frango crocante, cheddar, bacon, alface, tomate e maionese defumada.",
        translations: {
          "en-US": {
            imageAlt:
              "Crispy Chicken Cheddar burger with crispy chicken, cheddar, bacon, lettuce, tomato and smoked mayo.",
          },
        },
      },
      {
        id: "burger-outback-king",
        name: "O Outback King",
        description:
          "Creme de cheddar artesanal, cebola caramelizada, cubos de bacon crocante e molho barbecue especial.",
        price: 43.9,
        image: "./assets/outback-king-burguer.webp",
        imageAlt:
          "Hambúrguer O Outback King com creme de cheddar, cebola caramelizada, bacon crocante e molho barbecue.",
        tag: "Premium",
        translations: {
          "en-US": {
            imageAlt:
              "The Outback King burger with cheddar cream, caramelized onion, crispy bacon and barbecue sauce.",
            tag: "Premium",
          },
        },
      },
      {
        id: "burger-chicken-grill-supreme",
        name: "Chicken Grill Supreme",
        description:
          "Filé de frango grelhado com cheddar, bacon, alface, tomate, cebola crispy e maionese defumada.",
        price: 35.9,
        image: "./assets/chicken-supreme-burguer.webp",
        imageAlt:
          "Hambúrguer Chicken Grill Supreme com frango grelhado, cheddar, bacon, alface, tomate e cebola crispy.",
        translations: {
          "en-US": {
            imageAlt:
              "Chicken Grill Supreme burger with grilled chicken, cheddar, bacon, lettuce, tomato and crispy onion.",
          },
        },
      },
      {
        id: "burger-joia-da-coroa",
        name: "A Joia da Coroa",
        description:
          "Burger de picanha premium com queijo Canastra Real, cogumelos salteados e aioli de trufas brancas.",
        price: 58.9,
        image: "./assets/joia-burguer.webp",
        imageAlt:
          "Hambúrguer A Joia da Coroa com burger de picanha, queijo Canastra, cogumelos salteados e aioli de trufas.",
        tag: "Exclusivo",
        translations: {
          "en-US": {
            imageAlt:
              "The Crown Jewel burger with picanha, Canastra cheese, sautéed mushrooms and truffle aioli.",
            tag: "Exclusive",
          },
        },
      },
    ],
  },
  {
    id: "sides",
    title: "Acompanhamentos",
    icon: "fas fa-utensils",
    subtitle: "Complementos perfeitos para sua refeição",
    translations: {
      "en-US": {
        title: "Sides",
        subtitle: "Perfect additions to your meal",
      },
    },
    items: [
      {
        id: "side-fritas-cheddar",
        name: "Fritas Cheddar & Bacon",
        description:
          "Batatas fritas crocantes mergulhadas em creme de cheddar artesanal com cubos de bacon crocante.",
        price: 24.9,
        image: "./assets/batata-bacon.webp",
        imageAlt:
          "Porção de batatas fritas crocantes com creme de cheddar artesanal e cubos de bacon.",
        translations: {
          "en-US": {
            imageAlt: "Portion of crispy fries with craft cheddar cream and bacon cubes.",
          },
        },
      },
      {
        id: "side-batata-rustica",
        name: "Batatas Rústicas da Casa",
        description:
          "Cortes grossos com casca, fritos até ficarem crocantes, temperados com sal grosso e alecrim.",
        price: 18.9,
        image: "./assets/batata-rustica.webp",
        imageAlt: "Porção de batatas rústicas com casca, sal grosso e alecrim.",
        translations: {
          "en-US": {
            imageAlt: "Portion of rustic skin-on potatoes with coarse salt and rosemary.",
          },
        },
      },
      {
        id: "side-aneis-cebola",
        name: "Anéis de Cebola Crocantes",
        description:
          "Anéis de cebola empanados em mistura secreta e fritos à perfeição com molho barbecue especial.",
        price: 22.9,
        image: "./assets/anel-cebola.webp",
        imageAlt: "Porção de anéis de cebola empanados e crocantes acompanhados de molho barbecue.",
        translations: {
          "en-US": {
            imageAlt: "Portion of crispy breaded onion rings served with barbecue sauce.",
          },
        },
      },
    ],
  },
  {
    id: "drinks",
    title: "Bebidas",
    icon: "fas fa-glass-cheers",
    subtitle: "Refrescos para acompanhar seu pedido",
    translations: {
      "en-US": {
        title: "Drinks",
        subtitle: "Refreshing drinks to pair with your order",
      },
    },
    items: [
      {
        id: "drink-coca-lata",
        name: "Coca-Cola Lata",
        description: "Refrigerante gelado e refrescante para complementar sua refeição.",
        price: 5.9,
        image: "./assets/refri-1.webp",
        imageAlt: "Lata de Coca-Cola gelada para acompanhar o pedido.",
        translations: {
          "en-US": {
            imageAlt: "Cold Coca-Cola can to pair with the order.",
          },
        },
      },
      {
        id: "drink-guarana-antarctica",
        name: "Guaraná Antarctica",
        description: "Refrigerante com sabor único e refrescante para sua satisfação.",
        price: 5.9,
        image: "./assets/refri-2.webp",
        imageAlt: "Lata de Guaraná Antarctica gelada para acompanhar o pedido.",
        translations: {
          "en-US": {
            imageAlt: "Cold Guaraná Antarctica can to pair with the order.",
          },
        },
      },
    ],
  },
];

export const MENU_PRODUCTS = MENU_CATEGORIES.flatMap((category) => category.items);

export const MENU_PRODUCT_BY_ID = new Map(MENU_PRODUCTS.map((item) => [item.id, item]));

// Keep original objects/images and stable references used by the cart.
const ORIGINAL_PRODUCTS = new Map(MENU_PRODUCT_BY_ID);
const ORIGINAL_CLASSIFICATION = new Map(
  MENU_CATEGORIES.flatMap((category) =>
    category.items.map((product, index) => [product.id, { category: category.id, displayOrder: index + 1 }]),
  ),
);

export function applyPublicCatalog(rows) {
  if (!Array.isArray(rows)) return;
  const categories = new Map(MENU_CATEGORIES.map((category) => [category.id, category]));
  const catalog = new Map();
  for (const row of rows) {
    if (!row || typeof row.code !== "string" || !row.code.trim() ||
        typeof row.name !== "string" || !row.name.trim() ||
        typeof row.description !== "string" || !row.description.trim() ||
        !Number.isFinite(row.price) || row.price <= 0 || typeof row.isActive !== "boolean") continue;
    const fallback = ORIGINAL_CLASSIFICATION.get(row.code) ?? { category: "menu", displayOrder: 1000 };
    const category = row.category ?? fallback.category;
    const displayOrder = row.displayOrder ?? fallback.displayOrder;
    if (!categories.has(category) || !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 999999) continue;
    catalog.set(row.code, { ...row, category, displayOrder });
  }

  for (const product of MENU_PRODUCTS) product.isActive = false;
  for (const category of MENU_CATEGORIES) category.items.length = 0;
  const nextProducts = [];
  for (const row of catalog.values()) {
    /** @type {MenuProduct} */
    const product = MENU_PRODUCT_BY_ID.get(row.code) ?? ORIGINAL_PRODUCTS.get(row.code) ?? {
      id: row.code, name: row.name, description: row.description, price: row.price,
      image: "./assets/logo-burger.webp", imageAlt: row.name,
      translations: { "en-US": { imageAlt: row.name } },
    };
    Object.assign(product, {
      name: row.name, description: row.description, price: row.price,
      isActive: row.isActive, category: row.category, displayOrder: row.displayOrder,
    });
    const english = product.translations["en-US"];
    english.name = typeof row.englishName === "string" && row.englishName.trim() ? row.englishName.trim() : row.name;
    english.description = typeof row.englishDescription === "string" && row.englishDescription.trim() ? row.englishDescription.trim() : row.description;
    categories.get(row.category).items.push(product);
    product.imageUrl = typeof row.imageUrl === "string" ? row.imageUrl : null;
    nextProducts.push(product);
  }
  for (const category of MENU_CATEGORIES) {
    category.items.sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  MENU_PRODUCTS.splice(0, MENU_PRODUCTS.length, ...MENU_CATEGORIES.flatMap((category) => category.items));
  MENU_PRODUCT_BY_ID.clear();
  // Missing original products remain unavailable, but can still be resolved by existing cart entries.
  for (const [id, product] of ORIGINAL_PRODUCTS) MENU_PRODUCT_BY_ID.set(id, product);
  for (const product of nextProducts) MENU_PRODUCT_BY_ID.set(product.id, product);
}
