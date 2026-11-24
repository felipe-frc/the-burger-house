/**
 * The Burger House — Centralized Nutritional Data & Calculation Engine
 *
 * Sources:
 * - USDA FoodData Central (Foundation Foods)
 * - Tabela Brasileira de Composição de Alimentos (TBCA / USP)
 * - Tabela de Composição de Alimentos (TACO / UNICAMP)
 * - Official manufacturer nutrition declarations (Coca-Cola Brasil, Água Mineral)
 *
 * Estimates are calculated from standard recipe portions, commercial preparation methods,
 * and reliable compositional tables. Packaged products use verified manufacturer labels.
 */

export interface NutritionalValues {
  calories: number; // kcal
  carbohydrates: number; // g
  totalSugars: number; // g
  addedSugars?: number; // g
  protein: number; // g
  totalFat: number; // g
  saturatedFat: number; // g
  fiber: number; // g
  sodium: number; // mg
}

export type NutritionStatus = 'verified' | 'estimated' | 'unavailable';

export interface ServingInfo {
  amount: number;
  unit: 'g' | 'ml';
  labelPt: string;
  labelEn: string;
}

export interface ProductNutrition {
  productId: string;
  serving: ServingInfo;
  status: NutritionStatus;
  values: NutritionalValues | null;
  sourcePt: string;
  sourceEn: string;
  assumptionsPt?: string;
  assumptionsEn?: string;
}

export interface ExtraNutrition {
  extraId: string;
  namePt: string;
  nameEn: string;
  servingPt: string;
  servingEn: string;
  status: NutritionStatus;
  values: NutritionalValues;
  sourcePt: string;
  sourceEn: string;
}

/**
 * Daily Reference Values (Valores Diários de Referência — VDR)
 * Based on ANVISA RDC 429/2020 and standard 2,000 kcal (8,400 kJ) diet.
 */
export const DAILY_VALUES: Partial<Record<keyof NutritionalValues, number>> = {
  calories: 2000,
  carbohydrates: 300,
  addedSugars: 50,
  protein: 50,
  totalFat: 65,
  saturatedFat: 20,
  fiber: 25,
  sodium: 2000,
};

/**
 * Normalized product aliases across storefront and catalog references.
 */
const PRODUCT_ALIASES: Record<string, string> = {
  'coca-cola': 'coca-cola-original',
  'coca-cola-original': 'coca-cola-original',
  'coca-zero': 'coca-cola-zero',
  'coca-cola-zero': 'coca-cola-zero',
  'agua-gas': 'agua-com-gas',
  'agua-com-gas': 'agua-com-gas',
  'agua-mineral': 'agua-mineral',
};

/**
 * Central repository of nutritional data for all items in The Burger House.
 */
export const NUTRITION_CATALOG: Record<string, ProductNutrition> = {
  'the-classic': {
    productId: 'the-classic',
    serving: { amount: 235, unit: 'g', labelPt: '1 hambúrguer (235g)', labelEn: '1 burger (235g)' },
    status: 'estimated',
    values: {
      calories: 680,
      carbohydrates: 45,
      totalSugars: 11.5,
      addedSugars: 8.5,
      protein: 36,
      totalFat: 38,
      saturatedFat: 14,
      fiber: 2.2,
      sodium: 1040,
    },
    sourcePt: 'Estimativa baseada em USDA FoodData Central & TACO para pão brioche artesanal, hambúrguer bovino 80/20 na chapa, queijo cheddar derretido e molho da casa.',
    sourceEn: 'Estimate based on USDA FoodData Central & TACO for craft brioche bun, griddled 80/20 smash beef patty, melted cheddar cheese, and house sauce.',
    assumptionsPt: 'Pão brioche de 75g tostado, 1 smash bovino (100g in natura / ~80g grelhado), 1 fatia de queijo cheddar (25g), 25g de molho especial da casa, cebola fresca e picles.',
    assumptionsEn: '75g toasted brioche bun, 1 smash beef patty (100g raw / ~80g cooked), 1 slice of cheddar (25g), 25g house special sauce, fresh onion, and pickles.',
  },

  'double-smash': {
    productId: 'double-smash',
    serving: { amount: 335, unit: 'g', labelPt: '1 hambúrguer (335g)', labelEn: '1 burger (335g)' },
    status: 'estimated',
    values: {
      calories: 860,
      carbohydrates: 47,
      totalSugars: 12,
      addedSugars: 7,
      protein: 54,
      totalFat: 52,
      saturatedFat: 22,
      fiber: 2.5,
      sodium: 1030,
    },
    sourcePt: 'Estimativa baseada em USDA FoodData Central & TACO para pão brioche, duas carnes smash bovinas na chapa, porção dupla de cheddar e cebola caramelizada.',
    sourceEn: 'Estimate based on USDA FoodData Central & TACO for brioche bun, two griddled smash beef patties, double cheddar cheese, and caramelized onions.',
    assumptionsPt: 'Pão brioche de 75g, 2 smash burgers bovinos (200g in natura), 2 porções de cheddar derretido (50g), 35g de cebola caramelizada e picles artesanal.',
    assumptionsEn: '75g brioche bun, 2 smash beef patties (200g raw), 2 portions of melted cheddar (50g), 35g caramelized onions, and house pickles.',
  },

  'smokehouse-bbq': {
    productId: 'smokehouse-bbq',
    serving: { amount: 265, unit: 'g', labelPt: '1 hambúrguer (265g)', labelEn: '1 burger (265g)' },
    status: 'estimated',
    values: {
      calories: 790,
      carbohydrates: 56,
      totalSugars: 20,
      addedSugars: 17,
      protein: 42,
      totalFat: 46,
      saturatedFat: 16,
      fiber: 2.0,
      sodium: 1280,
    },
    sourcePt: 'Estimativa baseada em USDA FoodData Central para smash burger bovino, queijo cheddar, fatias de bacon crocante e molho barbecue defumado.',
    sourceEn: 'Estimate based on USDA FoodData Central for smash beef burger, cheddar cheese, crispy bacon slices, and smoked barbecue sauce.',
    assumptionsPt: 'Pão brioche de 75g, 1 smash bovino (100g in natura), cheddar derretido (25g), 2 fatias de bacon crocante (25g), 35g de molho barbecue defumado e cebola.',
    assumptionsEn: '75g brioche bun, 1 smash beef patty (100g raw), melted cheddar (25g), 2 slices crispy bacon (25g), 35g smoked barbecue sauce, and onion.',
  },

  'crispy-cheddar': {
    productId: 'crispy-cheddar',
    serving: { amount: 285, unit: 'g', labelPt: '1 sanduíche (285g)', labelEn: '1 sandwich (285g)' },
    status: 'estimated',
    values: {
      calories: 720,
      carbohydrates: 52,
      totalSugars: 9,
      addedSugars: 6,
      protein: 44,
      totalFat: 35,
      saturatedFat: 11,
      fiber: 2.4,
      sodium: 1370,
    },
    sourcePt: 'Estimativa baseada em TACO e USDA FoodData Central para filé de frango empanado crocante, queijo cheddar, bacon, salada fresca e maionese defumada.',
    sourceEn: 'Estimate based on TACO and USDA FoodData Central for crispy breaded chicken fillet, cheddar cheese, bacon, fresh lettuce, tomato, and smoked mayo.',
    assumptionsPt: 'Pão brioche de 75g, filé de peito de frango empanado e frito (130g), fatia de queijo cheddar (25g), bacon crocante (15g), alface, tomate e maionese defumada (25g).',
    assumptionsEn: '75g brioche bun, breaded fried chicken breast fillet (130g), cheddar cheese (25g), crispy bacon (15g), fresh lettuce, tomato, and smoked mayo (25g).',
  },

  'onion-crunch': {
    productId: 'onion-crunch',
    serving: { amount: 290, unit: 'g', labelPt: '1 hambúrguer (290g)', labelEn: '1 burger (290g)' },
    status: 'estimated',
    values: {
      calories: 810,
      carbohydrates: 56,
      totalSugars: 9,
      addedSugars: 6.5,
      protein: 40,
      totalFat: 49,
      saturatedFat: 18,
      fiber: 2.5,
      sodium: 1225,
    },
    sourcePt: 'Estimativa baseada em USDA FoodData Central para hambúrguer bovino grelhado, queijo suíço derretido, bacon, onion rings dourados e aioli de alho assado.',
    sourceEn: 'Estimate based on USDA FoodData Central for grilled beef patty, melted Swiss cheese, bacon, golden onion rings, and roasted garlic aioli.',
    assumptionsPt: 'Pão brioche de 75g, hambúrguer bovino grelhado (100g in natura), queijo suíço (30g), bacon crocante (25g), 3 anéis de cebola empanados (50g) e aioli de alho assado (25g).',
    assumptionsEn: '75g brioche bun, grilled beef patty (100g raw), Swiss cheese (30g), crispy bacon (25g), 3 breaded onion rings (50g), and roasted garlic aioli (25g).',
  },

  'o-praiano': {
    productId: 'o-praiano',
    serving: { amount: 300, unit: 'g', labelPt: '1 hambúrguer (300g)', labelEn: '1 burger (300g)' },
    status: 'estimated',
    values: {
      calories: 840,
      carbohydrates: 71,
      totalSugars: 29,
      addedSugars: 6.5,
      protein: 45,
      totalFat: 47,
      saturatedFat: 17,
      fiber: 3.1,
      sodium: 1050,
    },
    sourcePt: 'Estimativa baseada em TBCA (Tabela Brasileira) e TACO para queijo coalho grelhado, banana-da-terra frita, hambúrguer bovino, bacon, mel e maionese defumada.',
    sourceEn: 'Estimate based on TBCA and TACO for griddled coalho cheese, golden fried plantain, beef patty, bacon, honey drizzle, and smoked mayonnaise.',
    assumptionsPt: 'Pão brioche de 75g, hambúrguer bovino grelhado (100g), queijo coalho tostado na chapa (40g), banana-da-terra frita (50g), bacon crocante (20g), fio de mel (12g), maionese defumada (20g) e alface.',
    assumptionsEn: '75g brioche bun, grilled beef patty (100g), griddled coalho cheese (40g), fried plantain (50g), crispy bacon (20g), honey drizzle (12g), smoked mayo (20g), and lettuce.',
  },

  'classic-fries': {
    productId: 'classic-fries',
    serving: { amount: 180, unit: 'g', labelPt: '1 porção (150g batatas + 30g molho)', labelEn: '1 serving (150g fries + 30g sauce)' },
    status: 'estimated',
    values: {
      calories: 470,
      carbohydrates: 47,
      totalSugars: 2.4,
      addedSugars: 1.5,
      protein: 4.4,
      totalFat: 29,
      saturatedFat: 4.2,
      fiber: 3.8,
      sodium: 600,
    },
    sourcePt: 'Estimativa baseada em TBCA/USDA para batatas fritas em óleo vegetal com sal da casa e molho especial à parte.',
    sourceEn: 'Estimate based on TBCA/USDA for vegetable-oil fried potatoes with house salt and special sauce dip.',
    assumptionsPt: 'Porção de 150g de batatas fritas crocantes temperadas com sal da casa e 30g de molho especial à parte.',
    assumptionsEn: '150g serving of crispy fries seasoned with house salt and 30g special dip sauce on the side.',
  },

  'loaded-fries': {
    productId: 'loaded-fries',
    serving: { amount: 240, unit: 'g', labelPt: '1 porção (240g)', labelEn: '1 serving (240g)' },
    status: 'estimated',
    values: {
      calories: 620,
      carbohydrates: 48.5,
      totalSugars: 2.0,
      addedSugars: 0.5,
      protein: 17,
      totalFat: 39,
      saturatedFat: 12.2,
      fiber: 3.8,
      sodium: 1150,
    },
    sourcePt: 'Estimativa baseada em USDA FoodData Central & TBCA para batatas fritas cobertas com creme de cheddar derretido e cubos de bacon crocante.',
    sourceEn: 'Estimate based on USDA FoodData Central & TBCA for crispy fries topped with warm cheddar sauce and diced crispy bacon.',
    assumptionsPt: '150g de batatas fritas douradas, 60g de creme de queijo cheddar e 30g de cubos de bacon frito.',
    assumptionsEn: '150g golden fries, 60g warm cheddar cheese sauce, and 30g crispy bacon bits.',
  },

  'chicken-tenders': {
    productId: 'chicken-tenders',
    serving: { amount: 180, unit: 'g', labelPt: '1 porção de 4 tiras (180g)', labelEn: '1 serving of 4 tenders (180g)' },
    status: 'estimated',
    values: {
      calories: 440,
      carbohydrates: 22,
      totalSugars: 0.8,
      addedSugars: 0,
      protein: 36,
      totalFat: 23,
      saturatedFat: 4.2,
      fiber: 1.2,
      sodium: 780,
    },
    sourcePt: 'Estimativa baseada em TACO e USDA FoodData Central para tiras de peito de frango empanadas com crosta crocante e fritas.',
    sourceEn: 'Estimate based on TACO and USDA FoodData Central for hand-breaded crispy fried chicken breast strips.',
    assumptionsPt: '4 tiras de filé de peito de frango selecionado, marinadas, empanadas e fritas até dourarem (aprox. 180g total).',
    assumptionsEn: '4 selected chicken breast tenders, marinated, breaded, and fried golden (approx. 180g total).',
  },

  'strawberry-soda': {
    productId: 'strawberry-soda',
    serving: { amount: 350, unit: 'ml', labelPt: '1 copo (350ml)', labelEn: '1 glass (350ml)' },
    status: 'estimated',
    values: {
      calories: 110,
      carbohydrates: 28,
      totalSugars: 27,
      addedSugars: 25,
      protein: 0.2,
      totalFat: 0.1,
      saturatedFat: 0,
      fiber: 0.4,
      sodium: 14,
    },
    sourcePt: 'Estimativa calculada a partir de xarope artesanal de morango com fruta natural e açúcar cristal, água com gás e gelo.',
    sourceEn: 'Estimate calculated from artisanal strawberry fruit syrup with crystal sugar, sparkling water, and ice.',
    assumptionsPt: '35ml de xarope artesanal de polpa de morango, 250ml de água mineral com gás e cubos de gelo.',
    assumptionsEn: '35ml artisanal strawberry pulp syrup, 250ml sparkling mineral water, and ice cubes.',
  },

  'coca-cola-original': {
    productId: 'coca-cola-original',
    serving: { amount: 350, unit: 'ml', labelPt: '1 lata (350ml)', labelEn: '1 can (350ml)' },
    status: 'verified',
    values: {
      calories: 149,
      carbohydrates: 37,
      totalSugars: 37,
      addedSugars: 37,
      protein: 0,
      totalFat: 0,
      saturatedFat: 0,
      fiber: 0,
      sodium: 18,
    },
    sourcePt: 'Tabela nutricional oficial do fabricante (Coca-Cola Brasil, lata 350ml).',
    sourceEn: 'Official manufacturer nutritional facts label (Coca-Cola Brasil, 350ml can).',
    assumptionsPt: 'Informação declarada no rótulo oficial da embalagem original de 350ml.',
    assumptionsEn: 'Declared information from the official manufacturer packaging for 350ml.',
  },

  'coca-cola-zero': {
    productId: 'coca-cola-zero',
    serving: { amount: 350, unit: 'ml', labelPt: '1 lata (350ml)', labelEn: '1 can (350ml)' },
    status: 'verified',
    values: {
      calories: 0,
      carbohydrates: 0,
      totalSugars: 0,
      addedSugars: 0,
      protein: 0,
      totalFat: 0,
      saturatedFat: 0,
      fiber: 0,
      sodium: 49,
    },
    sourcePt: 'Tabela nutricional oficial do fabricante (Coca-Cola Brasil, lata 350ml sem açúcar).',
    sourceEn: 'Official manufacturer nutritional facts label (Coca-Cola Brasil, 350ml sugar-free can).',
    assumptionsPt: 'Informação declarada no rótulo oficial da lata de 350ml.',
    assumptionsEn: 'Declared information from the official manufacturer packaging for 350ml.',
  },

  'agua-mineral': {
    productId: 'agua-mineral',
    serving: { amount: 500, unit: 'ml', labelPt: '1 garrafa (500ml)', labelEn: '1 bottle (500ml)' },
    status: 'verified',
    values: {
      calories: 0,
      carbohydrates: 0,
      totalSugars: 0,
      addedSugars: 0,
      protein: 0,
      totalFat: 0,
      saturatedFat: 0,
      fiber: 0,
      sodium: 4,
    },
    sourcePt: 'Rótulo padrão de água mineral natural sem gás (garrafa 500ml).',
    sourceEn: 'Standard nutritional label for still natural mineral water (500ml bottle).',
    assumptionsPt: 'Água mineral natural sem aditivos, embalagem de 500ml.',
    assumptionsEn: 'Natural mineral water with zero additives, 500ml bottle.',
  },

  'agua-com-gas': {
    productId: 'agua-com-gas',
    serving: { amount: 500, unit: 'ml', labelPt: '1 garrafa (500ml)', labelEn: '1 bottle (500ml)' },
    status: 'verified',
    values: {
      calories: 0,
      carbohydrates: 0,
      totalSugars: 0,
      addedSugars: 0,
      protein: 0,
      totalFat: 0,
      saturatedFat: 0,
      fiber: 0,
      sodium: 6,
    },
    sourcePt: 'Rótulo padrão de água mineral natural gaseificada (garrafa 500ml).',
    sourceEn: 'Standard nutritional label for sparkling natural mineral water (500ml bottle).',
    assumptionsPt: 'Água mineral natural carbonatada, embalagem de 500ml.',
    assumptionsEn: 'Carbonated natural mineral water, 500ml bottle.',
  },

  'suco-laranja': {
    productId: 'suco-laranja',
    serving: { amount: 300, unit: 'ml', labelPt: '1 copo (300ml)', labelEn: '1 glass (300ml)' },
    status: 'estimated',
    values: {
      calories: 135,
      carbohydrates: 32,
      totalSugars: 26,
      addedSugars: 0,
      protein: 2.1,
      totalFat: 0.4,
      saturatedFat: 0.1,
      fiber: 0.8,
      sodium: 3,
    },
    sourcePt: 'Tabela Brasileira de Composição de Alimentos (TBCA/TACO) para suco de laranja natural integral sem adição de açúcares.',
    sourceEn: 'Brazilian Food Composition Table (TBCA/TACO) for 100% natural pure orange juice without added sugars.',
    assumptionsPt: 'Suco extraído de laranjas frescas espremidas na hora, sem adição de açúcar ou conservantes, servido gelado (copo 300ml).',
    assumptionsEn: 'Freshly squeezed natural orange juice without added sugar or preservatives, served chilled (300ml glass).',
  },
};

/**
 * Nutritional estimates for burger customization extras and add-ons.
 */
export const EXTRAS_NUTRITION: Record<string, ExtraNutrition> = {
  'extra-cheese': {
    extraId: 'extra-cheese',
    namePt: 'Queijo Cheddar Extra',
    nameEn: 'Extra Cheddar Cheese',
    servingPt: '1 fatia (25g)',
    servingEn: '1 slice (25g)',
    status: 'estimated',
    values: {
      calories: 95,
      carbohydrates: 1.0,
      totalSugars: 0.5,
      addedSugars: 0,
      protein: 5.0,
      totalFat: 8.0,
      saturatedFat: 5.0,
      fiber: 0,
      sodium: 180,
    },
    sourcePt: 'USDA FoodData Central — Queijo cheddar processado.',
    sourceEn: 'USDA FoodData Central — Processed cheddar cheese.',
  },

  'crispy-bacon': {
    extraId: 'crispy-bacon',
    namePt: 'Bacon Crocante Extra',
    nameEn: 'Extra Crispy Bacon',
    servingPt: '2 fatias (20g)',
    servingEn: '2 slices (20g)',
    status: 'estimated',
    values: {
      calories: 110,
      carbohydrates: 0.3,
      totalSugars: 0,
      addedSugars: 0,
      protein: 7.0,
      totalFat: 9.0,
      saturatedFat: 3.2,
      fiber: 0,
      sodium: 310,
    },
    sourcePt: 'TACO/USDA — Fatias de bacon suíno defumado e frito.',
    sourceEn: 'TACO/USDA — Smoked fried pork bacon strips.',
  },

  'pickles': {
    extraId: 'pickles',
    namePt: 'Picles Artesanal Extra',
    nameEn: 'Extra House Pickles',
    servingPt: 'Porção de 30g',
    servingEn: '30g serving',
    status: 'estimated',
    values: {
      calories: 8,
      carbohydrates: 1.8,
      totalSugars: 1.2,
      addedSugars: 0.8,
      protein: 0.3,
      totalFat: 0.1,
      saturatedFat: 0,
      fiber: 0.4,
      sodium: 260,
    },
    sourcePt: 'USDA FoodData Central — Picles de pepino em conserva agridoce.',
    sourceEn: 'USDA FoodData Central — Sweet and sour cucumber pickles.',
  },

  'onion-rings': {
    extraId: 'onion-rings',
    namePt: 'Onion Rings (3 unid.)',
    nameEn: 'Onion Rings (3 pcs)',
    servingPt: '3 unidades (60g)',
    servingEn: '3 rings (60g)',
    status: 'estimated',
    values: {
      calories: 165,
      carbohydrates: 18.0,
      totalSugars: 2.0,
      addedSugars: 1.0,
      protein: 2.5,
      totalFat: 9.5,
      saturatedFat: 1.8,
      fiber: 1.2,
      sodium: 240,
    },
    sourcePt: 'USDA FoodData Central — Anéis de cebola empanados e fritos.',
    sourceEn: 'USDA FoodData Central — Breaded and fried onion rings.',
  },

  'queijo-coalho': {
    extraId: 'queijo-coalho',
    namePt: 'Queijo Coalho Grelhado',
    nameEn: 'Griddled Coalho Cheese',
    servingPt: '1 fatia grossa (40g)',
    servingEn: '1 thick slice (40g)',
    status: 'estimated',
    values: {
      calories: 130,
      carbohydrates: 0.8,
      totalSugars: 0.5,
      addedSugars: 0,
      protein: 9.0,
      totalFat: 10.0,
      saturatedFat: 6.5,
      fiber: 0,
      sodium: 220,
    },
    sourcePt: 'TBCA — Queijo coalho brasileiro tostado na chapa.',
    sourceEn: 'TBCA — Griddled Brazilian coalho cheese.',
  },

  'molho-casa': {
    extraId: 'molho-casa',
    namePt: 'Molho da Casa Extra',
    nameEn: 'Extra House Sauce',
    servingPt: 'Potinho de 30g',
    servingEn: '30g cup',
    status: 'estimated',
    values: {
      calories: 125,
      carbohydrates: 2.5,
      totalSugars: 2.0,
      addedSugars: 1.8,
      protein: 0.5,
      totalFat: 13.0,
      saturatedFat: 2.0,
      fiber: 0.2,
      sodium: 190,
    },
    sourcePt: 'Estimativa baseada em maionese artesanal emulsionada com especiarias e picles.',
    sourceEn: 'Estimate based on emulsified artisanal mayo with spices and relish.',
  },
};

/**
 * Size portion factor for burgers.
 */
export const SIZE_MULTIPLIERS: Record<'small' | 'medium' | 'large', number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
};

/**
 * Retrieve nutritional profile for a given product by ID or alias.
 */
export function getProductNutrition(id: string): ProductNutrition | undefined {
  const normalizedId = PRODUCT_ALIASES[id] ?? id;
  return NUTRITION_CATALOG[normalizedId];
}

/**
 * Retrieve nutritional profile for a given extra.
 */
export function getExtraNutrition(id: string): ExtraNutrition | undefined {
  return EXTRAS_NUTRITION[id];
}

export interface ItemNutritionSummary {
  calories: number | null;
  baseCalories: number | null;
  extrasCalories: number;
  isComplete: boolean;
  missingDataReason?: string;
  values: NutritionalValues | null;
}

/**
 * Calculate the total nutritional values for a single item in the cart or menu,
 * accounting for portion size and optional extras.
 */
export function calculateItemNutrition(
  productId: string,
  size: 'small' | 'medium' | 'large' = 'medium',
  extras: Array<{ id: string }> = []
): ItemNutritionSummary {
  const base = getProductNutrition(productId);
  if (!base || !base.values || base.status === 'unavailable') {
    return {
      calories: null,
      baseCalories: null,
      extrasCalories: 0,
      isComplete: false,
      missingDataReason: 'Informação nutricional indisponível para este produto',
      values: null,
    };
  }

  const multiplier = SIZE_MULTIPLIERS[size] ?? 1.0;
  let hasIncompleteExtra = false;
  let extrasCalories = 0;

  const extrasNutrients: NutritionalValues = {
    calories: 0,
    carbohydrates: 0,
    totalSugars: 0,
    addedSugars: 0,
    protein: 0,
    totalFat: 0,
    saturatedFat: 0,
    fiber: 0,
    sodium: 0,
  };

  for (const extra of extras) {
    const extraData = getExtraNutrition(extra.id);
    if (!extraData || extraData.status === 'unavailable') {
      hasIncompleteExtra = true;
    } else {
      extrasCalories += extraData.values.calories;
      extrasNutrients.calories += extraData.values.calories;
      extrasNutrients.carbohydrates += extraData.values.carbohydrates;
      extrasNutrients.totalSugars += extraData.values.totalSugars;
      extrasNutrients.addedSugars = (extrasNutrients.addedSugars ?? 0) + (extraData.values.addedSugars ?? 0);
      extrasNutrients.protein += extraData.values.protein;
      extrasNutrients.totalFat += extraData.values.totalFat;
      extrasNutrients.saturatedFat += extraData.values.saturatedFat;
      extrasNutrients.fiber += extraData.values.fiber;
      extrasNutrients.sodium += extraData.values.sodium;
    }
  }

  const baseCalories = Math.round(base.values.calories * multiplier);
  const totalCalories = baseCalories + extrasCalories;

  const totalValues: NutritionalValues = {
    calories: totalCalories,
    carbohydrates: Math.round((base.values.carbohydrates * multiplier + extrasNutrients.carbohydrates) * 10) / 10,
    totalSugars: Math.round((base.values.totalSugars * multiplier + extrasNutrients.totalSugars) * 10) / 10,
    addedSugars: base.values.addedSugars !== undefined
      ? Math.round((base.values.addedSugars * multiplier + (extrasNutrients.addedSugars ?? 0)) * 10) / 10
      : undefined,
    protein: Math.round((base.values.protein * multiplier + extrasNutrients.protein) * 10) / 10,
    totalFat: Math.round((base.values.totalFat * multiplier + extrasNutrients.totalFat) * 10) / 10,
    saturatedFat: Math.round((base.values.saturatedFat * multiplier + extrasNutrients.saturatedFat) * 10) / 10,
    fiber: Math.round((base.values.fiber * multiplier + extrasNutrients.fiber) * 10) / 10,
    sodium: Math.round(base.values.sodium * multiplier + extrasNutrients.sodium),
  };

  return {
    calories: totalCalories,
    baseCalories,
    extrasCalories,
    isComplete: !hasIncompleteExtra,
    values: totalValues,
  };
}

export interface CartNutritionSummary {
  /** Complete estimated total calories if all items are known, or null if incomplete */
  totalCalories: number | null;
  /** Subtotal of all known calories (never counts unknown items as 0) */
  knownCalories: number;
  /** True when 100% of items and extras in the cart have nutritional data */
  isComplete: boolean;
  /** List of item names that lack complete nutritional data */
  incompleteItems: string[];
  /** Total number of units in the cart */
  totalUnits: number;
  /** Number of units in the cart with complete data */
  knownUnits: number;
}

/**
 * Calculates total nutritional values and calorie totals for the entire cart.
 * If any product or extra is missing data, isComplete is set to false,
 * and a clear incompleteItems list is provided so the UI never misrepresents unknown values as zero.
 */
export function calculateCartNutrition(
  cart: Array<{
    burger: { id: string; name: string };
    quantity: number;
    size?: 'small' | 'medium' | 'large';
    extras?: Array<{ id: string; name?: string }>;
  }>
): CartNutritionSummary {
  let knownCalories = 0;
  let isComplete = true;
  const incompleteItems: string[] = [];
  let totalUnits = 0;
  let knownUnits = 0;

  for (const item of cart) {
    const qty = Math.max(0, item.quantity);
    totalUnits += qty;
    const nutrition = calculateItemNutrition(item.burger.id, item.size ?? 'medium', item.extras ?? []);

    if (nutrition.calories !== null && nutrition.isComplete) {
      knownCalories += nutrition.calories * qty;
      knownUnits += qty;
    } else if (nutrition.calories !== null && !nutrition.isComplete) {
      // Base calories are known, but some extras are missing data
      knownCalories += nutrition.calories * qty;
      isComplete = false;
      if (!incompleteItems.includes(item.burger.name)) {
        incompleteItems.push(`${item.burger.name} (adicionais sem dados)`);
      }
    } else {
      isComplete = false;
      if (!incompleteItems.includes(item.burger.name)) {
        incompleteItems.push(item.burger.name);
      }
    }
  }

  return {
    totalCalories: isComplete ? knownCalories : null,
    knownCalories,
    isComplete,
    incompleteItems,
    totalUnits,
    knownUnits,
  };
}

/**
 * Formats a nutritional value into a localized string with units (e.g. "45 g", "1.040 mg", "680 kcal").
 */
export function formatNutritionAmount(value: number, unit: string, english = false): string {
  const formatted = new Intl.NumberFormat(english ? 'en-US' : 'pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
  return `${formatted} ${unit}`;
}
