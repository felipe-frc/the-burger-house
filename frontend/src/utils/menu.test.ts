import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BURGERS,
  calculateItemTotal,
  calculateOrderSummary,
  validateReviewForm,
  AVAILABLE_EXTRAS,
} from './menu';

test('BURGERS array contains the 6 official transparent burgers with expected names and prices', () => {
  assert.equal(BURGERS.length, 6);
  const names = BURGERS.map(b => b.name);
  assert.deepEqual(names, [
    'The Classic',
    'Double Smash',
    'Smokehouse BBQ',
    'Crispy Cheddar',
    'Onion Crunch',
    'O Praiano',
  ]);

  assert.equal(BURGERS[0].price, 34.90);
  assert.equal(BURGERS[1].price, 42.90);
  assert.equal(BURGERS[2].price, 43.90);
  assert.equal(BURGERS[3].price, 35.90);
  assert.equal(BURGERS[4].price, 43.90);
  assert.equal(BURGERS[5].price, 43.90);
});

test('calculateItemTotal calculates base price with extras and quantity in BRL', () => {
  const classic = BURGERS[0]; // 34.90
  const cheese = AVAILABLE_EXTRAS[0]; // 4.50
  const bacon = AVAILABLE_EXTRAS[1]; // 6.00

  const single = calculateItemTotal({
    burger: classic,
    size: 'small', // 34.90
    quantity: 1,
    extras: [cheese], // +4.50 = 39.40
  });
  assert.equal(single, 39.40);

  const doubleWithExtras = calculateItemTotal({
    burger: classic,
    size: 'large', // 39.90
    quantity: 2,
    extras: [cheese, bacon], // 39.90 + 10.50 = 50.40 * 2 = 100.80
  });
  assert.equal(doubleWithExtras, 100.80);
});

test('calculateOrderSummary handles discounts and item counts correctly', () => {
  const doubleSmash = BURGERS[1]; // 42.90
  const item = {
    burger: doubleSmash,
    size: 'small' as const, // 42.90
    quantity: 2, // 85.80
    extras: [],
  };

  const withoutPromo = calculateOrderSummary([item]);
  assert.equal(withoutPromo.subtotal, 85.80);
  assert.equal(withoutPromo.discount, 0);
  assert.equal(withoutPromo.total, 85.80);
  assert.equal(withoutPromo.itemCount, 2);

  const withPromo = calculateOrderSummary([item], 'BURGERHOUSE10');
  assert.equal(withPromo.discount, 8.58);
  assert.equal(withPromo.total, 77.22);
});

test('validateReviewForm validates required fields properly', () => {
  const emptyResult = validateReviewForm({
    date: '',
    rating: 0,
    name: '',
    email: '',
    feedback: '',
  });
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.errors.date);
  assert.ok(emptyResult.errors.rating);
  assert.ok(emptyResult.errors.name);
  assert.ok(emptyResult.errors.email);
  assert.ok(emptyResult.errors.feedback);

  const validResult = validateReviewForm({
    date: '2026-10-29',
    rating: 5,
    name: 'Felipe Marcos',
    email: 'marcos@example.com',
    feedback: 'Melhor smash burger da cidade! O pão brioche e a crosta são sensacionais.',
  });
  assert.equal(validResult.valid, true);
  assert.equal(Object.keys(validResult.errors).length, 0);
});
