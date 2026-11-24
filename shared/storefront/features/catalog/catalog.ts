import { apiRequest, resolveApiAssetUrl } from "../../lib/api-client";

const classicBurger = "/assets/produtos/hamburgueres/the-classic.webp";
const doubleSmash = "/assets/produtos/hamburgueres/double-smash.webp";
const smokehouse = "/assets/produtos/hamburgueres/smokehouse-bbq.webp";
const crispyCheddar = "/assets/produtos/hamburgueres/crispy-chicken.webp";
const onionCrunch = "/assets/produtos/hamburgueres/onion-rings.webp";
const praiano = "/assets/produtos/hamburgueres/praiano.webp";
const classicFries = "/assets/produtos/acompanhamentos/classic-fries.webp";
const loadedFries = "/assets/produtos/acompanhamentos/loaded-fries.webp";
const chickenTenders = "/assets/produtos/acompanhamentos/chicken-tenders.webp";
const strawberrySoda = "/assets/produtos/bebidas/strawberry-soda.webp";
const coke = "/assets/produtos/bebidas/coca-cola-original.webp";
const cokeZero = "/assets/produtos/bebidas/coca-cola-zero.webp";
const water = "/assets/produtos/bebidas/agua-mineral.webp";
const sparklingWater = "/assets/produtos/bebidas/agua-com-gas.webp";
const orangeJuice = "/assets/produtos/bebidas/suco-laranja.webp";

export const catalogCategories = ["Burgers", "Acompanhamentos", "Bebidas"] as const;
export type CatalogCategory = (typeof catalogCategories)[number];

export type CatalogProduct = {
  id: string;
  storefrontId: string;
  code: string | null;
  name: string;
  englishName: string;
  description: string;
  englishDescription: string;
  price: number;
  image: string;
  uploadedImage: string | null;
  imageAlt: string;
  category: CatalogCategory;
  displayOrder: number;
  available: boolean;
  isNew?: boolean;
  source: "api" | "fallback";
};

export type PublicProduct = {
  code: string;
  name: string;
  description: string;
  price: number;
  isActive: boolean;
  englishName?: string;
  englishDescription?: string;
  category?: string;
  displayOrder?: number;
  imageUrl?: string | null;
};

type FallbackProduct = Omit<CatalogProduct, "storefrontId" | "uploadedImage" | "code" | "available" | "source"> & {
  apiCodes: string[];
  aliases?: string[];
};

export const fallbackCatalog: FallbackProduct[] = [
  {
    id: "crispy-cheddar",
    apiCodes: ["burger-crispy-chicken-cheddar"],
    aliases: ["Crispy Chicken Cheddar"],
    name: "Crispy Cheddar",
    englishName: "Crispy Cheddar",
    description:
      "Filé de frango empanado, cheddar derretido, bacon, alface, tomate e maionese defumada no pão brioche.",
    englishDescription:
      "Breaded chicken, melted cheddar, bacon, lettuce, tomato and smoked mayo on a brioche bun.",
    price: 35.9,
    image: crispyCheddar,
    imageAlt: "Crispy Cheddar com frango crocante, cheddar, bacon, alface e tomate",
    category: "Burgers",
    displayOrder: 10,
    isNew: true,
  },
  {
    id: "onion-crunch",
    apiCodes: ["burger-onion-rings"],
    aliases: ["O Famoso Onion Ring"],
    name: "Onion Crunch",
    englishName: "Onion Crunch",
    description:
      "Hambúrguer bovino, queijo suíço, bacon, onion rings crocantes e aioli de alho assado no pão brioche.",
    englishDescription:
      "Beef patty, Swiss cheese, bacon, crispy onion rings and roasted garlic aioli on a brioche bun.",
    price: 43.9,
    image: onionCrunch,
    imageAlt: "Onion Crunch com queijo suíço, bacon e anéis de cebola crocantes",
    category: "Burgers",
    displayOrder: 20,
    isNew: true,
  },
  {
    id: "o-praiano",
    apiCodes: ["burger-praiano"],
    aliases: ["O Praiano"],
    name: "O Praiano",
    englishName: "O Praiano",
    description:
      "Queijo coalho, banana-da-terra, bacon crocante, fio de mel e maionese defumada no pão brioche.",
    englishDescription:
      "Coalho cheese, plantain, crispy bacon, honey and smoked mayo on a brioche bun.",
    price: 43.9,
    image: praiano,
    imageAlt: "O Praiano com queijo coalho, banana-da-terra e bacon",
    category: "Burgers",
    displayOrder: 30,
    isNew: true,
  },
  {
    id: "the-classic",
    apiCodes: [],
    name: "The Classic",
    englishName: "The Classic",
    description: "Carne smash, cheddar, cebola, picles e molho da casa no pão brioche.",
    englishDescription: "Smash patty, cheddar, onion, pickles and house sauce on a brioche bun.",
    price: 34.9,
    image: classicBurger,
    imageAlt: "The Classic com carne smash, cheddar, cebola e picles",
    category: "Burgers",
    displayOrder: 40,
  },
  {
    id: "double-smash",
    apiCodes: [],
    name: "Double Smash",
    englishName: "Double Smash",
    description: "Dois smash burgers, cheddar duplo, picles e cebola caramelizada no pão brioche.",
    englishDescription:
      "Two smash patties, double cheddar, pickles and caramelized onion on a brioche bun.",
    price: 42.9,
    image: doubleSmash,
    imageAlt: "Double Smash com duas carnes, cheddar, picles e cebola caramelizada",
    category: "Burgers",
    displayOrder: 50,
  },
  {
    id: "smokehouse-bbq",
    apiCodes: [],
    name: "Smokehouse BBQ",
    englishName: "Smokehouse BBQ",
    description: "Carne smash, cheddar, bacon crocante, cebola e barbecue defumado no pão brioche.",
    englishDescription:
      "Smash patty, cheddar, crispy bacon, onion and smoky barbecue sauce on a brioche bun.",
    price: 43.9,
    image: smokehouse,
    imageAlt: "Smokehouse BBQ com cheddar, bacon e molho barbecue",
    category: "Burgers",
    displayOrder: 60,
  },
  {
    id: "classic-fries",
    apiCodes: [],
    name: "Classic Fries",
    englishName: "Classic Fries",
    description: "Batatas sequinhas com sal da casa e molho especial à parte.",
    englishDescription: "Crispy fries with house salt and special sauce on the side.",
    price: 17.9,
    image: classicFries,
    imageAlt: "Porção de Classic Fries crocantes",
    category: "Acompanhamentos",
    displayOrder: 10,
  },
  {
    id: "loaded-fries",
    apiCodes: ["side-fritas-cheddar"],
    aliases: ["Fritas Cheddar & Bacon"],
    name: "Loaded Fries",
    englishName: "Loaded Fries",
    description: "Fritas crocantes cobertas com creme de cheddar e cubos de bacon.",
    englishDescription: "Crispy fries topped with creamy cheddar and bacon bites.",
    price: 24.9,
    image: loadedFries,
    imageAlt: "Loaded Fries com cheddar cremoso e bacon",
    category: "Acompanhamentos",
    displayOrder: 20,
  },
  {
    id: "chicken-tenders",
    apiCodes: [],
    name: "Chicken Tenders",
    englishName: "Chicken Tenders",
    description: "Tiras de frango empanadas, crocantes por fora e suculentas por dentro.",
    englishDescription: "Breaded chicken strips, crunchy outside and juicy inside.",
    price: 26.9,
    image: chickenTenders,
    imageAlt: "Chicken Tenders crocantes servidos na caixa da casa",
    category: "Acompanhamentos",
    displayOrder: 30,
  },
  {
    id: "strawberry-soda",
    apiCodes: [],
    name: "Strawberry Soda",
    englishName: "Strawberry Soda",
    description: "Soda artesanal de morango, gelo e o toque refrescante da casa.",
    englishDescription: "House strawberry soda with ice and a refreshing finish.",
    price: 12.9,
    image: strawberrySoda,
    imageAlt: "Strawberry Soda com gelo e canudo listrado",
    category: "Bebidas",
    displayOrder: 10,
  },
  {
    id: "coca-cola-original",
    apiCodes: ["drink-coca-lata"],
    aliases: ["Coca-Cola Lata", "Coca-Cola Original"],
    name: "Coca-Cola Original",
    englishName: "Coca-Cola Original",
    description: "Lata de 350 ml servida bem gelada.",
    englishDescription: "A chilled 350 ml can.",
    price: 5.9,
    image: coke,
    imageAlt: "Lata de Coca-Cola Original gelada",
    category: "Bebidas",
    displayOrder: 20,
  },
  {
    id: "coca-cola-zero",
    apiCodes: [],
    name: "Coca-Cola Zero",
    englishName: "Coca-Cola Zero",
    description: "Lata de 350 ml sem açúcar, servida bem gelada.",
    englishDescription: "A chilled, sugar-free 350 ml can.",
    price: 5.9,
    image: cokeZero,
    imageAlt: "Lata de Coca-Cola Zero Açúcar gelada",
    category: "Bebidas",
    displayOrder: 30,
  },
  {
    id: "agua-mineral",
    apiCodes: [],
    name: "Água Mineral",
    englishName: "Mineral Water",
    description: "Água mineral sem gás, garrafa de 500 ml.",
    englishDescription: "Still mineral water, 500 ml bottle.",
    price: 4.9,
    image: water,
    imageAlt: "Garrafa de água mineral sem gás",
    category: "Bebidas",
    displayOrder: 40,
  },
  {
    id: "agua-com-gas",
    apiCodes: [],
    name: "Água com Gás",
    englishName: "Sparkling Water",
    description: "Água mineral com gás, garrafa de 500 ml.",
    englishDescription: "Sparkling mineral water, 500 ml bottle.",
    price: 5.9,
    image: sparklingWater,
    imageAlt: "Garrafa de água mineral com gás",
    category: "Bebidas",
    displayOrder: 50,
  },
  {
    id: "suco-laranja",
    apiCodes: [],
    name: "Suco de Laranja",
    englishName: "Orange Juice",
    description: "Suco de laranja refrescante servido bem gelado.",
    englishDescription: "Refreshing orange juice served chilled.",
    price: 11.9,
    image: orangeJuice,
    imageAlt: "Copo de suco de laranja gelado",
    category: "Bebidas",
    displayOrder: 60,
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function mapCategory(category?: string): CatalogCategory {
  if (category === "sides") return "Acompanhamentos";
  if (category === "drinks") return "Bebidas";
  return "Burgers";
}

function findApiProduct<T extends Pick<PublicProduct, 'code' | 'name'>>(fallback: FallbackProduct, products: T[]) {
  const demonstration = products.find(product => product.code === `demo-${fallback.id}`);
  if (demonstration) return demonstration;
  const coded = products.find((product) => fallback.apiCodes.includes(product.code));
  if (coded) return coded;
  const names = [fallback.name, ...(fallback.aliases ?? [])].map(normalize);
  // AdminService creates immutable codes as <original-name-slug>-<12 hex>.
  // Recognize that persisted identity even after an administrative rename.
  const slugs = names.map((name) => name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  const generated = products.filter((product) => {
    const match = /^(.*)-[a-f0-9]{12}$/.exec(product.code);
    return match && slugs.includes(match[1]!);
  });
  if (generated.length) return generated.length === 1 ? generated[0] : undefined;
  const matches = products.filter((product) => names.includes(normalize(product.name)));
  return matches.length === 1 ? matches[0] : undefined;
}

export function storefrontProductId(product: Pick<PublicProduct, 'code' | 'name'>) {
  const byCode = fallbackCatalog.find(fallback => findApiProduct(fallback, [{ code: product.code, name: '' }]));
  return byCode?.id ?? fallbackCatalog.find(fallback => findApiProduct(fallback, [product]))?.id;
}

function mergeFallback(fallback: FallbackProduct, apiProduct?: PublicProduct): CatalogProduct {
  const uploadedImage = resolveApiAssetUrl(apiProduct?.imageUrl);
  return {
    id: apiProduct?.code ?? fallback.id,
    storefrontId: fallback.id,
    code: apiProduct?.code ?? null,
    name: apiProduct?.name || fallback.name,
    englishName: apiProduct ? apiProduct.englishName?.trim() || apiProduct.name : fallback.englishName,
    description: apiProduct?.description || fallback.description,
    englishDescription: apiProduct ? apiProduct.englishDescription?.trim() || apiProduct.description : fallback.englishDescription,
    price: apiProduct?.price ?? fallback.price,
    image: uploadedImage ?? fallback.image,
    uploadedImage,
    imageAlt: fallback.imageAlt,
    category: apiProduct?.category ? mapCategory(apiProduct.category) : fallback.category,
    displayOrder: apiProduct?.displayOrder ?? fallback.displayOrder,
    available:
      apiProduct?.isActive === true && Number.isFinite(apiProduct.price) && apiProduct.price > 0,
    isNew: fallback.isNew ?? false,
    source: apiProduct ? "api" : "fallback",
  };
}

export function createFallbackCatalog(): CatalogProduct[] {
  return fallbackCatalog.map((product) => mergeFallback(product));
}

export function mergeCatalog(products: PublicProduct[]): CatalogProduct[] {
  const matched = new Set<string>();
  const featured = fallbackCatalog.map((fallback) => {
    const match = findApiProduct(fallback, products);
    if (match) matched.add(match.code);
    return mergeFallback(fallback, match);
  });
  // The Owner assigns this suffix to newly managed products. Existing excluded legacy codes stay outside the public list.
  const additional: CatalogProduct[] = products.filter(product => product.isActive && !matched.has(product.code) && /-[a-f0-9]{12}$/.test(product.code)).map(product => {
    const uploadedImage = resolveApiAssetUrl(product.imageUrl);
    return {
      id: product.code, storefrontId: `catalog:${product.code}`, code: product.code,
      name: product.name, englishName: product.englishName?.trim() || product.name,
      description: product.description, englishDescription: product.englishDescription?.trim() || product.description,
      price: product.price, image: uploadedImage ?? '', uploadedImage, imageAlt: product.name,
      category: mapCategory(product.category ?? 'menu'), displayOrder: product.displayOrder ?? 1000,
      available: Number.isFinite(product.price) && product.price > 0, source: 'api',
    };
  });

  return [...featured, ...additional].sort((a, b) => {
    const categoryOrder =
      catalogCategories.indexOf(a.category) - catalogCategories.indexOf(b.category);
    return (
      categoryOrder || a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "pt-BR")
    );
  });
}

export async function fetchCatalog(signal?: AbortSignal) {
  const products = await apiRequest<PublicProduct[]>("/api/products", signal ? { signal } : {});
  if (
    !Array.isArray(products) ||
    products.some(
      (p) =>
        !p ||
        typeof p.code !== "string" ||
        !p.code ||
        typeof p.name !== "string" ||
        typeof p.price !== "number" ||
        !Number.isFinite(p.price) ||
        p.price < 0 ||
        typeof p.isActive !== "boolean" ||
        [p.description, p.englishName, p.englishDescription, p.imageUrl].some(value => value != null && typeof value !== "string") ||
        (p.category != null && !["menu", "sides", "drinks"].includes(p.category)) ||
        (p.displayOrder != null && !Number.isInteger(p.displayOrder)),
    ) ||
    new Set(products.map(product => product.code)).size !== products.length
  ) {
    throw new Error("O catálogo retornado pela loja é inválido. Tente novamente.");
  }
  return mergeCatalog(products);
}
