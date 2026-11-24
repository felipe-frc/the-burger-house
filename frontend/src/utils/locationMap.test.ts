import test from 'node:test';
import assert from 'node:assert/strict';
import { readMapTilerKey, mapFailureMessage } from './locationMap';

test('rejects missing keys and control characters, including the reported U+0016', () => {
  for (const value of [undefined, '', '   ']) assert(readMapTilerKey(value).error);
  for (const value of ['\u0016', 'example\u0016value', '\nexample', 'example\t']) {
    assert(readMapTilerKey(value).error?.includes('controle'));
  }
  assert(readMapTilerKey('example value').error);
  assert.equal(readMapTilerKey(' example-key ').key, 'example-key');
});

test('distinguishes worker, WebGL, policy and HTTP failures without exposing provider URLs', () => {
  const cases = [
    [{ message: 'Worker failed to load' }, 'Worker'],
    [{ message: 'Failed to initialize WebGL' }, 'WebGL'],
    [{ name: 'SecurityError' }, 'segurança'],
    [{ status: 401 }, '401'], [{ status: 403 }, 'origens'],
    [{ status: 404 }, '404'], [{ status: 429 }, '429'],
    [{ status: 503 }, 'indisponível'],
  ] as const;
  for (const [error, expected] of cases) assert(mapFailureMessage(error).includes(expected));
  for (const error of [{ status: 403 }, {}, { message: 'Worker failed' }]) {
    const result = mapFailureMessage({ ...error, message: `${'message' in error ? error.message : ''} https://example.invalid/?key=TEST_SENTINEL` });
    assert(!result.includes('TEST_SENTINEL'));
    assert(!result.includes('https://'));
  }
});
