import type { BurgerItem } from '../../utils/menu';

/** Format the existing catalogue sentence; never infer ingredients or allergens. */
export function burgerIngredients(burger: Pick<BurgerItem, 'ingredients'> & Partial<Pick<BurgerItem, 'id'>>, english = false): string[] {
  if (english && burger.id && englishIngredients[burger.id]) return englishIngredients[burger.id];
  const text = burger.ingredients?.trim().replace(/\.$/, '');
  if (!text) return [];
  const items = text.split(/,\s*/).filter(Boolean);
  if (!items.length) return [];
  const last = items.pop()!;
  // Only the final conjunction joins two ingredients in the current catalogue.
  // Earlier "e" belongs to phrases such as "empanados e crocantes".
  const conjunction = last.lastIndexOf(' e ');
  items.push(...(conjunction < 0 ? [last] : [last.slice(0, conjunction), last.slice(conjunction + 3)]));
  return items.map(item => item.charAt(0).toLocaleUpperCase('pt-BR') + item.slice(1));
}

// UI-only translations of the existing recipes; no catalogue fields or prices change.
const englishIngredients: Record<string, string[]> = {
  'the-classic': ['Toasted brioche bun', 'Griddled smash beef patty', 'Melted cheddar', 'Onion', 'Pickles', 'House sauce'],
  'double-smash': ['Toasted brioche bun', 'Two griddled smash beef patties', 'Double melted cheddar', 'Pickles', 'Caramelized onion'],
  'smokehouse-bbq': ['Toasted brioche bun', 'Griddled smash beef patty', 'Melted cheddar', 'Crispy bacon', 'Onion', 'Smoked barbecue sauce'],
  'crispy-cheddar': ['Toasted brioche bun', 'Crispy breaded chicken fillet', 'Melted cheddar', 'Crispy bacon', 'Fresh lettuce', 'Tomato', 'Smoked mayonnaise'],
  'onion-crunch': ['Toasted brioche bun', 'Grilled beef patty', 'Melted Swiss cheese', 'Crispy bacon', 'Crispy breaded onion rings', 'Roasted garlic aioli'],
  'o-praiano': ['Toasted brioche bun', 'Grilled beef patty', 'Griddled coalho cheese', 'Golden fried plantain', 'Crispy bacon', 'Drizzle of honey', 'Smoked mayonnaise', 'Fresh lettuce'],
};
