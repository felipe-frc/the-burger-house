import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProductNutrition,
  getExtraNutrition,
  calculateItemNutrition,
  calculateCartNutrition,
  formatNutritionAmount,
} from './nutrition';
import { BURGERS, SIDES_AND_DRINKS, AVAILABLE_EXTRAS } from '../utils/menu';

test('all burgers in menu have corresponding nutritional profiles', () => {
  assert.equal(BURGERS.length, 6);
  for (const burger of BURGERS) {
    const profile = getProductNutrition(burger.id);
    assert.ok(profile, `Missing nutritional profile for burger: ${burger.id}`);
    assert.equal(profile.status, 'estimated');
    assert.ok(profile.values, `Missing nutritional values for ${burger.id}`);
    assert.ok(profile.values.calories > 500, `Unrealistic burger calories for ${burger.id}: ${profile.values.calories}`);
    assert.ok(profile.values.protein > 20, `Unrealistic protein for ${burger.id}: ${profile.values.protein}`);
    assert.ok(profile.values.totalFat > 20, `Unrealistic fat for ${burger.id}: ${profile.values.totalFat}`);
    assert.ok(profile.values.carbohydrates > 30, `Unrealistic carbs for ${burger.id}: ${profile.values.carbohydrates}`);
    assert.ok(profile.values.sodium > 500, `Unrealistic sodium for ${burger.id}: ${profile.values.sodium}`);
    assert.ok(profile.sourcePt.length > 10, `Missing Portuguese source for ${burger.id}`);
    assert.ok(profile.sourceEn.length > 10, `Missing English source for ${burger.id}`);
  }
});

test('all sides and drinks have corresponding nutritional profiles', () => {
  for (const item of SIDES_AND_DRINKS) {
    const profile = getProductNutrition(item.id);
    assert.ok(profile, `Missing nutritional profile for side/drink: ${item.id}`);
    assert.ok(profile.values !== undefined, `Undefined values for ${item.id}`);
  }
});

test('packaged beverages contain verified manufacturer data', () => {
  const coke = getProductNutrition('coca-cola');
  assert.ok(coke);
  assert.equal(coke.status, 'verified');
  assert.equal(coke.values?.calories, 149);
  assert.equal(coke.values?.carbohydrates, 37);
  assert.equal(coke.values?.totalSugars, 37);
  assert.equal(coke.values?.addedSugars, 37);
  assert.equal(coke.values?.protein, 0);
  assert.equal(coke.values?.totalFat, 0);

  const cokeZero = getProductNutrition('coca-zero');
  assert.ok(cokeZero);
  assert.equal(cokeZero.status, 'verified');
  assert.equal(cokeZero.values?.calories, 0);
  assert.equal(cokeZero.values?.totalSugars, 0);
  assert.ok((cokeZero.values?.sodium ?? 0) > 0);

  const stillWater = getProductNutrition('agua-mineral');
  assert.ok(stillWater);
  assert.equal(stillWater.status, 'verified');
  assert.equal(stillWater.values?.calories, 0);

  const sparklingWater = getProductNutrition('agua-gas');
  assert.ok(sparklingWater);
  assert.equal(sparklingWater.status, 'verified');
  assert.equal(sparklingWater.values?.calories, 0);
});

test('all available extras have valid nutritional data', () => {
  for (const extra of AVAILABLE_EXTRAS) {
    const extraNutrition = getExtraNutrition(extra.id);
    assert.ok(extraNutrition, `Missing nutrition for extra: ${extra.id}`);
    assert.ok(extraNutrition.values.calories > 0, `Calories should be > 0 for extra: ${extra.id}`);
    assert.ok(extraNutrition.sourcePt.length > 5);
  }
});

test('calculateItemNutrition scales calories based on portion size', () => {
  const medium = calculateItemNutrition('the-classic', 'medium');
  const small = calculateItemNutrition('the-classic', 'small');
  const large = calculateItemNutrition('the-classic', 'large');

  assert.equal(medium.calories, 680);
  assert.equal(small.calories, Math.round(680 * 0.85)); // 578
  assert.equal(large.calories, Math.round(680 * 1.20)); // 816
});

test('calculateItemNutrition adds extras calories and macros accurately', () => {
  const classicWithCheeseAndBacon = calculateItemNutrition('the-classic', 'medium', [
    { id: 'extra-cheese' }, // +95 kcal, 5g prot, 8g fat, 1g carb
    { id: 'crispy-bacon' }, // +110 kcal, 7g prot, 9g fat, 0.3g carb
  ]);

  // Base 680 + 95 + 110 = 885 kcal
  assert.equal(classicWithCheeseAndBacon.calories, 885);
  assert.equal(classicWithCheeseAndBacon.baseCalories, 680);
  assert.equal(classicWithCheeseAndBacon.extrasCalories, 205);
  assert.ok(classicWithCheeseAndBacon.values);
  assert.equal(classicWithCheeseAndBacon.values.protein, 36 + 5 + 7); // 48g
  assert.equal(classicWithCheeseAndBacon.isComplete, true);
});

test('calculateCartNutrition computes totals for single and multiple items', () => {
  const cart = [
    {
      burger: { id: 'the-classic', name: 'The Classic' },
      quantity: 2, // 2 * 680 = 1360
      size: 'medium' as const,
      extras: [],
    },
    {
      burger: { id: 'classic-fries', name: 'Classic Fries' },
      quantity: 1, // 470
      size: 'medium' as const,
      extras: [],
    },
    {
      burger: { id: 'coca-cola', name: 'Coca-Cola Original' },
      quantity: 2, // 2 * 149 = 298
      size: 'medium' as const,
      extras: [],
    },
  ];

  const result = calculateCartNutrition(cart);
  assert.equal(result.isComplete, true);
  assert.equal(result.incompleteItems.length, 0);
  assert.equal(result.totalUnits, 5);
  assert.equal(result.knownUnits, 5);
  // 1360 + 470 + 298 = 2128
  assert.equal(result.totalCalories, 2128);
  assert.equal(result.knownCalories, 2128);
});

test('calculateCartNutrition does not count unknown items as zero and marks cart incomplete', () => {
  const cartWithUnknown = [
    {
      burger: { id: 'the-classic', name: 'The Classic' },
      quantity: 1, // 680 kcal
      size: 'medium' as const,
      extras: [],
    },
    {
      burger: { id: 'item-sem-dados', name: 'Sobremesa Secreta' },
      quantity: 1, // unknown
      size: 'medium' as const,
      extras: [],
    },
  ];

  const result = calculateCartNutrition(cartWithUnknown);
  assert.equal(result.isComplete, false);
  assert.equal(result.totalCalories, null); // never present false total
  assert.equal(result.knownCalories, 680); // subtotal of known items
  assert.equal(result.incompleteItems.length, 1);
  assert.equal(result.incompleteItems[0], 'Sobremesa Secreta');
});

test('formatNutritionAmount formats numbers according to locale', () => {
  assert.equal(formatNutritionAmount(45, 'g', false), '45 g');
  assert.equal(formatNutritionAmount(1040, 'mg', false), '1.040 mg');
  assert.equal(formatNutritionAmount(1040, 'mg', true), '1,040 mg');
  assert.equal(formatNutritionAmount(2.5, 'g', false), '2,5 g');
  assert.equal(formatNutritionAmount(2.5, 'g', true), '2.5 g');
});
