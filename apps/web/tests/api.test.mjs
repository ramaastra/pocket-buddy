import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { apiRequest, ApiError } from '../app/api.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('accepts an empty 202 response from a password reset request', async () => {
  globalThis.fetch = async () => new Response(null, { status: 202 });
  assert.equal(await apiRequest('/auth/password-reset/request', { email: 'person@example.test' }), undefined);
});

test('handles empty 204 responses and parses successful JSON', async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await apiRequest('/auth/logout', {}), undefined);
  globalThis.fetch = async () => Response.json({ user: { id: 'synthetic' } });
  assert.deepEqual(await apiRequest('/auth/me'), { user: { id: 'synthetic' } });
});

test('returns server error messages for unsuccessful responses', async () => {
  globalThis.fetch = async () => Response.json({ error: 'Try again' }, { status: 400 });
  await assert.rejects(apiRequest('/auth/login', {}), /Try again/);
});


test('preserves structured errors for invalid links', async () => {
  globalThis.fetch = async () => Response.json({ error: 'Link is invalid or expired', code: 'invalid_link' }, { status: 400 });
  await assert.rejects(apiRequest('/auth/verification/check', { token: 'synthetic' }), error => error instanceof ApiError && error.status === 400 && error.code === 'invalid_link');
});
