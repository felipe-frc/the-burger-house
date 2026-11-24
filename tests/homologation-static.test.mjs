import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolveStaticFile } from '../scripts/homologation-static.mjs';
let root;
before(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'burger-static-test-'));
  await mkdir(resolve(root, 'admin/assets'), { recursive: true });
  await writeFile(resolve(root, 'index.html'), '<!doctype html><title>Store fixture</title>');
  await writeFile(resolve(root, 'admin/index.html'), '<!doctype html><title>Owner fixture</title>');
  await writeFile(resolve(root, 'admin/assets/app.js'), 'export const fixture = true;');
  await writeFile(resolve(root, 'admin/assets/app.css'), ':root { color: black; }');
  await writeFile(resolve(root, '.env.local'), 'synthetic-private-fixture');
  await writeFile(resolve(root, 'localhost.key'), 'synthetic-private-fixture');
});
test('private files never become public even when accidentally included in the package', async () => {
  for (const path of ['/.env.local', '/%2eenv.local', '/localhost.key'])
    assert.equal((await resolveStaticFile(root, path)).status, 404);
});
after(async () => { if (root) await rm(root, { recursive: true }); });
test('existing JS and CSS resolve to actual assets', async () => {
  for (const asset of (await readdir(resolve(root, 'admin/assets'))).filter(name => /\.(js|css)$/.test(name))) {
    const result = await resolveStaticFile(root, `/admin/assets/${asset}`);
    assert.equal(result.file, resolve(root, 'admin/assets', asset));
    assert.equal(result.status, 200);
  }
});
test('missing assets and malformed/traversal paths never fall back to HTML', async () => {
  for (const path of ['/admin/assets/missing.js', '/admin/assets/missing', '/admin/missing.css', '/other']) assert.equal((await resolveStaticFile(root, path)).status, 404);
  for (const path of ['/../secret', '/%2e%2e/secret', '/bad%ZZ', '/admin%5csecret']) assert.equal((await resolveStaticFile(root, path)).status, 400);
});
test('store root resolves to HTML and known admin routes use the packaged entry', async () => {
  assert.equal((await resolveStaticFile(root, '/')).file, resolve(root, 'index.html'));
  for (const path of ['/admin', '/admin/', '/admin/finance']) assert.equal((await resolveStaticFile(root, path)).file, resolve(root, 'admin/index.html'));
});
test('unknown Owner routes do not silently resolve to the dashboard', async () => {
  for (const path of ['/admin/not-a-module', '/admin/orders/not-an-id', '/admin/orders/0', '/admin/courier/0'])
    assert.equal((await resolveStaticFile(root, path)).status, 404);
  for (const path of ['/admin/dashboard', '/admin/orders/42', '/admin/courier/42', '/admin/security', '/admin/store', '/admin/settings'])
    assert.equal((await resolveStaticFile(root, path)).file, resolve(root, 'admin/index.html'));
});
