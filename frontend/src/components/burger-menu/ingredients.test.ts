import test from 'node:test';
import assert from 'node:assert/strict';
import { BURGERS } from '../../utils/menu';
import { burgerIngredients } from './ingredients';

test('formats all six existing ingredient sentences without adding ingredient text', () => {
  assert.equal(BURGERS.length, 6);
  for (const burger of BURGERS) {
    const items = burgerIngredients(burger);
    assert.ok(items.length >= 5);
    for (const item of items) assert.ok(burger.ingredients.toLocaleLowerCase('pt-BR').includes(item.toLocaleLowerCase('pt-BR')));
  }
});
test('keeps compound preparation descriptions intact and separates the final ingredient', () => {
  const onion = burgerIngredients(BURGERS.find(b => b.id === 'onion-crunch')!);
  assert.ok(onion.includes('Anéis de cebola empanados e crocantes (onion rings)'));
  assert.equal(onion.at(-1), 'Aioli de alho assado');
  const praiano = burgerIngredients(BURGERS.find(b => b.id === 'o-praiano')!);
  assert.ok(praiano.includes('Banana-da-terra frita e dourada'));
  assert.equal(praiano.at(-1), 'Alface fresca');
});
test('empty or unavailable ingredient data stays empty', () => {
  assert.deepEqual(burgerIngredients({ ingredients: '' }), []);
  assert.deepEqual(burgerIngredients({ ingredients: ',' }), []);
});
