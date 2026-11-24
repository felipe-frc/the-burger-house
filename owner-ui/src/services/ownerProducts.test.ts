import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapProduct, saveProduct, validateProductImage, type ProductDto } from './ownerProducts';
import { clearAdminCsrf } from './adminHttp';
import { mergeCatalog } from '../../../shared/storefront/features/catalog/catalog';
test('product edit preserves server translations, null cost and classification', async () => {
  const original = globalThis.fetch;
  const product: ProductDto = { id: 1, name: 'Produto', description: 'Descrição', price: 30, costPrice: null, isActive: true, englishName: 'Product', englishDescription: 'Description', category: 'menu', displayOrder: 3, imageUrl: null };
  let payload: Record<string, unknown> | undefined;
  globalThis.fetch = async (_path, init) => {
    if (init?.method === 'PATCH') { payload = JSON.parse(String(init.body)); return new Response(null, { status: 204 }); }
    return Response.json({ csrfToken: 'test-only' });
  };
  try {
    clearAdminCsrf(); await saveProduct({ ...mapProduct(product), price: 32 }, product);
    assert.ok(payload);
    assert.equal(payload.price, 32); assert.equal(payload.costPrice, null);
    assert.equal(payload.englishName, 'Product'); assert.equal(payload.englishDescription, 'Description');
    assert.equal(payload.category, 'menu'); assert.equal(payload.displayOrder, 3);
    assert.equal(payload.prepTimeMinutes, undefined);
  } finally { globalThis.fetch = original; clearAdminCsrf(); }
});

test('catalog image keeps Owner and curated storefront paths aligned without accepting foreign URLs', () => {
  const product: ProductDto = { id: 1, code: 'burger-praiano', name: 'Produto renomeado', description: '', price: 30,
    costPrice: null, isActive: true, englishName: '', englishDescription: '', category: 'menu', displayOrder: 1, imageUrl: null };
  assert.equal(mapProduct(product).imageUrl, '/assets/products/o-praiano-384.webp');
  assert.equal(mapProduct({ ...product, imageUrl: 'https://external.invalid/img.webp' }).imageUrl, '/assets/products/o-praiano-384.webp');
  const path = '/api/product-images/12345678123456781234567812345678.webp';
  assert.equal(mapProduct({ ...product, imageUrl: path }).imageUrl, path);
  assert.equal(mapProduct({ ...product, imageUrl: path }).uploadedImage, true);
});

test('catalog image selection rejects empty, large and unsupported files', () => {
  assert.throws(() => validateProductImage(new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })), /JPG/);
  assert.throws(() => validateProductImage(new File([], 'empty.png', { type: 'image/png' })), /5 MB/);
  assert.throws(() => validateProductImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })), /5 MB/);
  assert.doesNotThrow(() => validateProductImage(new File([new Uint8Array(5 * 1024 * 1024)], 'limit.webp', { type: 'image/webp' })));
});

test('the public catalog uses saved English copy and the Portuguese fallback for new products', () => {
  const imageUrl = '/api/product-images/12345678123456781234567812345678.webp';
  const [fresh, paused] = [
    { code: 'synthetic-menu-fff123456789', name: 'Produto novo', description: 'Descrição publicada', price: 23.5, isActive: true,
      englishName: 'New product', englishDescription: '', category: 'drinks', imageUrl },
    { code: 'synthetic-paused', name: 'Produto pausado', description: '', price: 15, isActive: false },
  ];
  const catalog = mergeCatalog([fresh, paused]);
  const product = catalog.find(item => item.code === fresh.code);
  assert.equal(product?.storefrontId, 'catalog:synthetic-menu-fff123456789');
  assert.equal(product?.englishName, 'New product');
  assert.equal(product?.englishDescription, 'Descrição publicada');
  assert.equal(product?.uploadedImage, imageUrl);
  assert.equal(product?.price, 23.5);
  assert.ok(!catalog.some(item => item.code === paused.code));
});
