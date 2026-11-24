// GET-only post-cleanup check. Does not authenticate or change any records.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url);
const { keepCodes } = JSON.parse(await fs.readFile(new URL('scripts/admin/definitive-catalog.json', root), 'utf8'));
const before = JSON.parse(await fs.readFile(new URL('test-results/catalog-final/production-public-api.json', root), 'utf8'));
const endpoint = 'https://the-burger-house-api-gqfkakgnfvfxd0g0.brazilsouth-01.azurewebsites.net/api/products';
const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
assert.equal(response.status, 200, 'Public catalog must return HTTP 200');
const actual = await response.json();
assert.ok(Array.isArray(actual));
assert.equal(actual.length, 15, 'Expected exactly 15 products');
assert.deepEqual(actual.map(p => p.code).sort(), [...keepCodes].sort(), 'Definitive codes differ');
for (const p of actual) assert.deepEqual(p, before.find(b => b.code === p.code), `Public fields changed: ${p.code}`);
console.log(JSON.stringify({ status: 'passed', method: 'GET', endpoint, productCount: actual.length, all15PublicProductFieldsUnchanged: true, checkedAt: new Date().toISOString() }, null, 2));
