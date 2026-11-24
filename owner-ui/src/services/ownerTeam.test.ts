import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTeam, saveTeam } from './ownerTeam';
import { clearAdminCsrf } from './adminHttp';

test('team uses server filters and revision without creating authentication credentials', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(String(url).endsWith('/auth/login') ? { csrfToken: 'test-token' } : { items: [], total: 0 });
  };
  try {
    clearAdminCsrf();
    await loadTeam('Maria', 'false', 2);
    assert.match(calls[0].url, /search=Maria&page=2&active=false/);
    await saveTeam({ name: 'Maria', email: 'synthetic@example.invalid', role: 'Gerente', department: 'Administração', shift: '18:00', active: false, revision: 3 }, 8);
    const write = calls.at(-1)!;
    assert.equal(write.url, '/api/admin/team/8');
    assert.equal(write.init?.method, 'PUT');
    const body = JSON.parse(String(write.init?.body));
    assert.equal(body.revision, 3);
    assert.equal(body.active, false);
    assert.equal(body.password, undefined);
    assert.equal(new Headers(write.init?.headers).get('X-CSRF-TOKEN'), 'test-token');
  } finally { globalThis.fetch = original; clearAdminCsrf(); }
});
