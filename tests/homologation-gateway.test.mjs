import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request } from 'node:https';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

// Explicit opt-in: certificate and web package come from a newly prepared local fixture.
// All API responses below are controlled; no operational database or provider is contacted.
const root = process.env.HOMOLOGATION_TEST_ROOT;
const enabled = !!root && !!process.env.BURGER_BUILD_OUTPUT_DIR;
const fixtureAuthority = enabled ? readFileSync(resolve(root,'localhost.crt')) : undefined;
const identity = root && createHash('sha256').update(process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root)).digest('hex');

function get(origin, path, method = 'GET') {
  return new Promise((accept, reject) => {
    const req = request(origin + path, { method, ca: fixtureAuthority }, res => {
      const chunks = [];
      res.on('data', data => chunks.push(data));
      res.on('end', () => accept({ status: res.statusCode, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
}

async function setup(database, wrongIdentity = false) {
  const state = { environment: 'Homologation', isolated: true, sandbox: true, database,
    provider: database === 'tbh_portfolio_dev' ? 'PostgreSQL' : 'SQLite',
    environmentId: wrongIdentity ? 'other-fixture' : identity, localCheckout: true };
  const calls = [];
  const api = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/homologation/info') return res.end(JSON.stringify(state));
    calls.push(req.url); res.end('{"controlled":true}');
  });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  const child = spawn(process.execPath, ['scripts/serve-homologation.mjs'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOMOLOGATION_ROOT: root, HOMOLOGATION_API_PORT: String(api.address().port),
      HOMOLOGATION_GATEWAY_PORT: '0', HOMOLOGATION_EXPECTED_DATABASE: database,
      HOMOLOGATION_DISABLE_CHECKOUT: '0', HOMOLOGATION_PUBLIC_READY: '1' },
  });
  child.stderr.resume();
  const closed = once(child, 'close');
  const stop = async () => {
    if (child.exitCode === null) child.kill();
    await closed;
    api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
  };
  if (wrongIdentity) return { child, closed, stop };
  const lines = createInterface({ input: child.stdout });
  const timeout = setTimeout(() => lines.close(), 15000);
  let origin;
  for await (const line of lines) {
    const match = /https:\/\/localhost:(\d+)/.exec(line);
    if (match) { origin = 'https://127.0.0.1:' + match[1]; break; }
  }
  clearTimeout(timeout); lines.close(); child.stdout.resume();
  if (!origin) { await stop(); throw new Error('Controlled gateway failed to listen.'); }
  return { origin, state, calls, stop };
}

test('revalidates database, provider and fixture on every API request', { skip: !enabled }, async () => {
  const server = await setup('burgerhouse.homologation.db');
  try {
    assert.equal((await get(server.origin, '/api/checkout/7', 'POST')).status, 200);
    assert.deepEqual(server.calls, ['/api/checkout/7']);
    server.state.database = 'tbh_portfolio_dev';
    assert.equal((await get(server.origin, '/api/products')).status, 502);
    assert.equal((await get(server.origin, '/api/checkout/7', 'POST')).status, 502);
    server.state.database = 'burgerhouse.homologation.db';
    server.state.provider = 'PostgreSQL';
    assert.equal((await get(server.origin, '/api/products')).status, 502);
    server.state.provider = 'SQLite'; server.state.environmentId = 'another-root';
    assert.equal((await get(server.origin, '/api/products')).status, 502);
    assert.deepEqual(server.calls, ['/api/checkout/7']);
  } finally { await server.stop(); }
});

test('portfolio checkout stays blocked even with public-ready and local-checkout flags', { skip: !enabled }, async () => {
  const server = await setup('tbh_portfolio_dev');
  try {
    assert.equal(JSON.parse((await get(server.origin, '/homologation-info')).text).checkoutEnabled, false);
    assert.equal((await get(server.origin, '/api/checkout/5', 'POST')).status, 503);
    assert.deepEqual(server.calls, []);
  } finally { await server.stop(); }
});

test('startup refuses another fixture even when its database filename matches', { skip: !enabled }, async () => {
  const server = await setup('burgerhouse.homologation.db', true);
  try { assert.notEqual((await server.closed)[0], 0); }
  finally { await server.stop(); }
});
