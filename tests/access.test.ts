import test from 'node:test';
import assert from 'node:assert/strict';
import { readToken, signToken, staffCookie, validSession } from '../src/access';
test('private links reject tampering, wrong token purpose, and malformed signatures', () => {
  const token = signToken('offer', 'one-offer');
  assert.equal(readToken(token, 'offer'), 'one-offer');
  assert.equal(readToken(token, 'staff'), undefined);
  assert.equal(readToken(token + 'x', 'offer'), undefined);
  assert.equal(readToken(token.split('.')[0] + '.' + 'é'.repeat(43), 'offer'), undefined);
  assert.equal(readToken('invalid', 'offer'), undefined);
});
test('staff cookie has an expiry and rejects expired or offer tokens', () => {
  assert.equal(validSession(staffCookie()), true);
  assert.equal(validSession('juniper_session=' + signToken('staff', String(Date.now() - 1000))), false);
  assert.equal(validSession('juniper_session=' + signToken('offer', '1')), false);
  assert.equal(validSession(), false);
});
