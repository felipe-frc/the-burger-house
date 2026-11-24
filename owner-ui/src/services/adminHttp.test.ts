import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminRequest, clearAdminCsrf, loginOwner, logoutOwner, AdminApiError } from './adminHttp';

test('concurrent mutations share CSRF initialization and each mutation runs once', async () => {
  const original = globalThis.fetch;
  let reads = 0, writes = 0;
  globalThis.fetch = async (_path, init) => {
    if (init?.method === 'GET') {
      reads++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return Response.json({ csrfToken: 'shared-fixture' });
    }
    writes++;
    assert.equal(new Headers(init?.headers).get('X-CSRF-TOKEN'), 'shared-fixture');
    return new Response(null, { status: 204 });
  };
  try {
    clearAdminCsrf();
    await Promise.all([1, 2, 3].map(id => adminRequest(`/api/admin/orders/${id}/status`, { method: 'PATCH' })));
    assert.equal(reads, 1);
    assert.equal(writes, 3);
  } finally { globalThis.fetch = original; clearAdminCsrf(); }
});

test('clearing the session during CSRF initialization prevents a stale mutation', async () => {
  const original = globalThis.fetch;
  let release!: (response: Response) => void;
  let writes = 0;
  globalThis.fetch = async (_path, init) => {
    if (init?.method === 'GET') return new Promise<Response>(resolve => { release = resolve; });
    writes++;
    return new Response(null, { status: 204 });
  };
  try {
    clearAdminCsrf();
    const operation = assert.rejects(adminRequest('/api/admin/orders/1/status', { method: 'PATCH' }),
      (error: unknown) => error instanceof AdminApiError && error.status === 401);
    clearAdminCsrf();
    release(Response.json({ csrfToken: 'stale-fixture' }));
    await operation;
    assert.equal(writes, 0);
  } finally { globalThis.fetch = original; clearAdminCsrf(); }
});

test('failed CSRF initialization can recover without replaying a mutation', async () => {
  const original = globalThis.fetch;
  let reads = 0, writes = 0;
  globalThis.fetch = async (_path, init) => {
    if (init?.method === 'GET') return ++reads === 1
      ? Response.json({}, { status: 503 }) : Response.json({ csrfToken: 'recovered-fixture' });
    writes++;
    return new Response(null, { status: 204 });
  };
  try {
    clearAdminCsrf();
    await assert.rejects(adminRequest('/api/admin/orders/1/status', { method: 'PATCH' }));
    assert.equal(writes, 0);
    await adminRequest('/api/admin/orders/1/status', { method: 'PATCH' });
    assert.equal(reads, 2);
    assert.equal(writes, 1);
  } finally { globalThis.fetch = original; clearAdminCsrf(); }
});

test('login obtains CSRF, uses cookies, refreshes CSRF after authentication and logs out', async () => {
  const original = globalThis.fetch;
  const calls: { path: string; init: RequestInit }[] = [];
  const replies = [{ csrfToken: 'anonymous' }, { role: 'Owner' }, { role: 'Owner', csrfToken: 'authenticated' }, null];
  globalThis.fetch = async (path, init) => {
    calls.push({ path: String(path), init: init! });
    const body = replies.shift();
    return body === null ? new Response(null, { status: 204 }) : Response.json(body);
  };
  try {
    clearAdminCsrf();
    await loginOwner(' owner@example.test ', 'test-only-password');
    await logoutOwner();
    assert.deepEqual(calls.map(c => c.path), ['/api/admin/auth/login', '/api/admin/auth/login', '/api/admin/auth/me', '/api/admin/auth/logout']);
    assert.equal(new Headers(calls[1].init.headers).get('X-CSRF-TOKEN'), 'anonymous');
    assert.equal(new Headers(calls[3].init.headers).get('X-CSRF-TOKEN'), 'authenticated');
    assert.ok(calls.every(c => c.init.credentials === 'same-origin'));
  } finally { globalThis.fetch = original; clearAdminCsrf(); }
});

test('server failure is explicit and mutation is never automatically replayed', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => { count++; return new Response('{}', { status: 503 }); };
  try {
    await assert.rejects(adminRequest('/api/admin/orders'), (error: unknown) => error instanceof AdminApiError && error.status === 503);
    assert.equal(count, 1);
    await assert.rejects(adminRequest('https://example.test/api/admin/orders'));
    assert.equal(count, 1);
  } finally { globalThis.fetch = original; }
});

test('a successful HTML response is reported as a proxy error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>Vite</html>', { headers: { 'Content-Type': 'text/html' } });
  try {
    await assert.rejects(adminRequest('/api/admin/orders'), (error: unknown) =>
      error instanceof AdminApiError && error.status === 502 && error.message.includes('proxy'));
  } finally { globalThis.fetch = original; }
});
