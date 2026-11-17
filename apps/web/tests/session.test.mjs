import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avatarInitial } from '../app/session.ts';

test('uses the email initial when a signed-in session has no name', () => {
  assert.equal(avatarInitial({ user: { id: 'user-1', email: 'alex@example.test' }, csrfToken: 'csrf' }), 'A');
});
