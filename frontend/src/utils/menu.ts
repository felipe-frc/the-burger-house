export interface BurgerItem {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  badgeType: 'classic' | 'double' | 'smokehouse' | 'chicken' | 'onion' | 'praiano';
  description: string;
  ingredients: string;
  image: string;
  price: number;
  prices: {
    small: number;
    medium: number;
    large: number;
  };
  nutrition?: {
    calories: number;
    protein: string;
    fat: string;
  };
}

export interface MenuItemExtra {
  quantity?: number;
  id: string;
  name: string;
  price: number;
}

export interface SideOrDrinkItem {
  id: string;
  name: string;
  category: 'Acompanhamentos' | 'Bebidas' | 'Sides' | 'Drinks';
  price: number;
  image: string;
  desc: string;
}

export interface CartItem {
  burger: BurgerItem;
  size: 'small' | 'medium' | 'large';
  quantity: number;
  extras: MenuItemExtra[];
  customNotes?: string;
}

export const BURGERS: BurgerItem[] = [
  {
    id: 'the-classic',
    name: 'The Classic',
    tagline: 'O clássico que nunca decepciona',
    badge: 'SMASH ORIGINAL',
    badgeType: 'classic',
    description: 'Hambúrguer smash suculento, com cheddar derretido, cebola, picles e molho especial da casa, servido no pão brioche.',
    ingredients: 'Pão brioche levemente tostado, hambúrguer bovino smash grelhado na chapa, queijo cheddar derretido, cebola, picles e molho especial da casa.',
    image: '/assets/products/the-classic-384.webp',
    price: 34.90,
    prices: {
      small: 34.90,
      medium: 34.90,
      large: 39.90,
    },
    nutrition: {
      calories: 680,
      protein: '36g',
      fat: '38g',
    },
  },
  {
    id: 'double-smash',
    name: 'Double Smash',
    tagline: 'Dois hambúrgueres smash e cheddar em dobro',
    badge: 'DOUBLE CHEDDAR',
    badgeType: 'double',
    description: 'Dois hambúrgueres smash com crosta dourada, cheddar em dobro, picles e cebola caramelizada no pão brioche.',
    ingredients: 'Pão brioche levemente tostado, dois hambúrgueres bovinos smash grelhados na chapa, duas porções de queijo cheddar derretido, picles e cebola caramelizada.',
    image: '/assets/products/double-smash-384.webp',
    price: 42.90,
    prices: {
      small: 42.90,
      medium: 42.90,
      large: 47.90,
    },
    nutrition: {
      calories: 860,
      protein: '54g',
      fat: '52g',
    },
  },
  {
    id: 'smokehouse-bbq',
    name: 'Smokehouse BBQ',
    tagline: 'Smash suculento com bacon crocante e barbecue defumado',
    badge: 'DEFUMADO & BACON',
    badgeType: 'smokehouse',
    description: 'Hambúrguer smash suculento, acompanhado de cheddar derretido, bacon crocante, cebola e molho barbecue defumado no pão brioche.',
    ingredients: 'Pão brioche levemente tostado, hambúrguer bovino smash grelhado na chapa, queijo cheddar derretido, bacon crocante, cebola e molho barbecue defumado.',
    image: '/assets/products/smokehouse-bbq-384.webp',
    price: 43.90,
    prices: {
      small: 43.90,
      medium: 43.90,
      large: 48.90,
    },
    nutrition: {
      calories: 790,
      protein: '42g',
      fat: '46g',
    },
  },
  {
    id: 'crispy-cheddar',
    name: 'Crispy Cheddar',
    tagline: 'Filé de frango empanado, dourado e crocante',
    badge: 'CRISPY CHICKEN',
    badgeType: 'chicken',
    description: 'Filé de frango empanado, dourado e crocante, com cheddar derretido, bacon, alface, tomate e maionese defumada no pão brioche.',
    ingredients: 'Pão brioche levemente tostado, filé de frango empanado e crocante, queijo cheddar derretido, bacon crocante, alface fresca, tomate e maionese defumada.',
    image: '/assets/products/crispy-cheddar-384.webp',
    price: 35.90,
    prices: {
      small: 35.90,
      medium: 35.90,
      large: 40.90,
    },
    nutrition: {
      calories: 720,
      protein: '44g',
      fat: '35g',
    },
  },
  {
    id: 'onion-crunch',
    name: 'Onion Crunch',
    tagline: 'Queijo suíço, bacon crocante e onion rings dourados',
    badge: 'ONION RINGS',
    badgeType: 'onion',
    description: 'Hambúrguer bovino suculento com queijo suíço derretido, bacon crocante, onion rings dourados e aioli de alho assado no pão brioche.',
    ingredients: 'Pão brioche levemente tostado, hambúrguer bovino grelhado, queijo suíço derretido, bacon crocante, anéis de cebola empanados e crocantes (onion rings) e aioli de alho assado.',
    image: '/assets/products/onion-crunch-384.webp',
    price: 43.90,
    prices: {
      small: 43.90,
      medium: 43.90,
      large: 48.90,
    },
    nutrition: {
      calories: 810,
      protein: '40g',
      fat: '49g',
    },
  },
  {
    id: 'o-praiano',
    name: 'O Praiano',
    tagline: 'Queijo coalho grelhado, banana-da-terra e fio de mel',
    badge: 'TROPICAL CRAFT',
    badgeType: 'praiano',
    description: 'Hambúrguer bovino suculento com queijo coalho grelhado, banana-da-terra frita, bacon crocante, um delicado fio de mel, alface fresca e maionese defumada no pão brioche.',
    ingredients: 'Pão brioche levemente tostado, hambúrguer bovino grelhado, queijo coalho grelhado com marcas de chapa, banana-da-terra frita e dourada, bacon crocante, fio de mel, maionese defumada e alface fresca.',
    image: '/assets/products/o-praiano-384.webp',
    price: 43.90,
    prices: {
      small: 43.90,
      medium: 43.90,
      large: 48.90,
    },
    nutrition: {
      calories: 840,
      protein: '45g',
      fat: '47g',
    },
  },
];

export const AVAILABLE_EXTRAS: MenuItemExtra[] = [
  { id: 'extra-cheese', name: 'Queijo Cheddar Extra', price: 4.50 },
  { id: 'crispy-bacon', name: 'Bacon Crocante Extra', price: 6.00 },
  { id: 'pickles', name: 'Picles Artesanal Extra', price: 3.00 },
  { id: 'onion-rings', name: 'Onion Rings (3 unid.)', price: 6.50 },
  { id: 'queijo-coalho', name: 'Queijo Coalho Grelhado', price: 7.00 },
  { id: 'molho-casa', name: 'Molho da Casa Extra', price: 3.50 },
];

export const SIDES_AND_DRINKS: SideOrDrinkItem[] = [
  {
    id: 'classic-fries',
    name: 'Classic Fries',
    category: 'Acompanhamentos',
    price: 17.90,
    image: '/assets/products/classic-fries-384.webp',
    desc: 'Batatas fritas douradas e crocantes, temperadas com o sal da casa e acompanhadas de molho especial à parte.',
  },
  {
    id: 'loaded-fries',
    name: 'Loaded Fries',
    category: 'Acompanhamentos',
    price: 24.90,
    image: '/assets/products/loaded-fries-384.webp',
    desc: 'Batatas fritas douradas e crocantes, cobertas com creme de cheddar e cubos de bacon.',
  },
  {
    id: 'chicken-tenders',
    name: 'Chicken Tenders',
    category: 'Acompanhamentos',
    price: 26.90,
    image: '/assets/products/chicken-tenders-384.webp',
    desc: 'Tiras de frango empanadas, douradas e crocantes por fora, com interior macio e suculento.',
  },
  {
    id: 'strawberry-soda',
    name: 'Strawberry Soda',
    category: 'Bebidas',
    price: 12.90,
    image: '/assets/products/strawberry-soda-384.webp',
    desc: 'Soda artesanal de morango, servida com gelo, refrescante e levemente gaseificada.',
  },
  {
    id: 'coca-cola',
    name: 'Coca-Cola Original',
    category: 'Bebidas',
    price: 5.90,
    image: '/assets/products/coca-cola-384.webp',
    desc: 'O refrigerante clássico Coca-Cola Original, servido gelado.',
  },
  {
    id: 'coca-zero',
    name: 'Coca-Cola Zero',
    category: 'Bebidas',
    price: 5.90,
    image: '/assets/products/coca-zero-384.webp',
    desc: 'Coca-Cola Zero Açúcar, lata de 350 ml, servida bem gelada.',
  },
  {
    id: 'agua-mineral',
    name: 'Água Mineral',
    category: 'Bebidas',
    price: 4.90,
    image: '/assets/products/agua-mineral-384.webp',
    desc: 'Água mineral sem gás, em garrafa de 500 ml.',
  },
  {
    id: 'agua-gas',
    name: 'Água com Gás',
    category: 'Bebidas',
    price: 5.90,
    image: '/assets/products/agua-gas-384.webp',
    desc: 'Água mineral gaseificada em garrafa de 500 ml.',
  },
  {
    id: 'suco-laranja',
    name: 'Suco de Laranja',
    category: 'Bebidas',
    price: 11.90,
    image: '/assets/products/suco-laranja-384.webp',
    desc: 'Suco de laranja refrescante, com aparência natural e coloração característica da fruta.',
  },
];

const brl = ['pt-BR', 'en-US'].map(locale => new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }));
export function formatBRL(amount: number, english = false): string {
  return brl[english ? 1 : 0].format(amount);
}

export function calculateItemTotal(item: CartItem): number {
  const basePrice = item.burger.prices?.[item.size] ?? item.burger.price ?? 34.90;
  const extrasTotal = item.extras.reduce((sum, ext) => sum + ext.price, 0);
  return (basePrice + extrasTotal) * item.quantity;
}

export function calculateOrderSummary(
  cart: CartItem[],
  discountCode?: string
): { subtotal: number; discount: number; total: number; itemCount: number } {
  const subtotal = cart.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  let discount = 0;

  const code = discountCode ? discountCode.trim().toUpperCase() : '';
  if (code === 'BURGERHOUSE10' || code === 'BURGER10' || code === 'PRETTY10') {
    discount = Math.round(subtotal * 0.1 * 100) / 100;
  }

  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return { subtotal, discount, total, itemCount };
}

export interface ReviewFormData {
  date: string;
  rating: number;
  name: string;
  email: string;
  feedback: string;
}

export function validateReviewForm(data: ReviewFormData): { valid: boolean; errors: Partial<Record<keyof ReviewFormData, string>> } {
  const errors: Partial<Record<keyof ReviewFormData, string>> = {};

  if (!data.date) {
    errors.date = 'Por favor, selecione a data da sua visita';
  }
  if (!data.rating || data.rating < 1 || data.rating > 5) {
    errors.rating = 'Por favor, avalie de 1 a 5 estrelas';
  }
  if (!data.name || data.name.trim().length < 2) {
    errors.name = 'Por favor, informe seu nome';
  }
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Por favor, informe um e-mail válido';
  }
  if (!data.feedback || data.feedback.trim().length < 5) {
    errors.feedback = 'Por favor, compartilhe sua opinião (mínimo de 5 caracteres)';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
