import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, initialState } from '../src/rules';
import { seedEntries } from '../src/seed';
const now = 1_000_000;
function fixture() { return initialState(seedEntries(now)); }
function opening(state: ReturnType<typeof fixture>, id = 'opening-1') {
  return applyCommand(state, { type: 'create', opening: { id, service: 'Haircut', stylist: 'Elena', startsAt: now + 3_600_000, durationMinutes: 30 } }, now);
}
test('earliest eligible client gets the only offer; retry does not duplicate simulated text', () => {
  const state = fixture(); opening(state);
  const first = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now);
  const retry = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now);
  assert.equal(first.offer?.entryId, 'sample-1'); assert.equal(first.offer?.expiresAt, now + 900_000);
  assert.deepEqual(retry, first); assert.equal(state.messages.length, 1);
});
test('filters service, required stylist, and availability for full appointment duration', () => {
  for (const mismatch of [{ service: 'Color' }, { stylist: 'Theo' }, { availableFrom: now + 4_000_000 }, { availableUntil: now + 3_700_000 }]) {
    const state = fixture(); Object.assign(state.entries[0], mismatch); opening(state);
    assert.equal(applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer?.entryId, 'sample-2');
  }
});
test('concurrent opening requests cannot claim same client, including duplicate rows', () => {
  const state = fixture(); state.entries.splice(1, 0, { ...state.entries[0], id: 'duplicate' });
  opening(state); opening(state, 'opening-2');
  const first = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  const second = applyCommand(state, { type: 'claim', openingId: 'opening-2' }, now).offer!;
  assert.notEqual(state.entries.find(e => e.id === first.entryId)!.clientId, state.entries.find(e => e.id === second.entryId)!.clientId);
});
test('accept atomically fulfills client and booking; repeated clicks return same result and one confirmation', () => {
  const state = fixture(); state.entries.push({ ...state.entries[0], id: 'duplicate' }); opening(state);
  const offer = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  const accepted = applyCommand(state, { type: 'accept', offerId: offer.id }, now + 1);
  assert.equal(accepted.opening?.status, 'filled'); assert.equal(accepted.offer?.status, 'accepted');
  assert.ok(state.entries.filter(e => e.clientId === 'client-1').every(e => e.fulfilled));
  assert.deepEqual(applyCommand(state, { type: 'accept', offerId: offer.id }, now + 2), accepted);
  assert.equal(state.messages.filter(m => m.kind === 'confirmation').length, 1);
  opening(state, 'opening-2'); assert.equal(applyCommand(state, { type: 'claim', openingId: 'opening-2' }, now).offer?.entryId, 'sample-2');
});
test('deadline is enforced at acceptance even if opening worker has not handled timer', () => {
  const state = fixture(); opening(state); const offer = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  assert.equal(applyCommand(state, { type: 'accept', offerId: offer.id }, offer.expiresAt).ok, false);
  assert.equal(offer.status, 'expired'); assert.equal(state.entries[0].fulfilled, false);
});
test('expiration after acceptance cannot undo booking', () => {
  const state = fixture(); opening(state); const offer = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  applyCommand(state, { type: 'accept', offerId: offer.id }, now + 1);
  applyCommand(state, { type: 'expire', offerId: offer.id }, offer.expiresAt);
  assert.equal(state.openings['opening-1'].status, 'filled');
});
test('opening create retries preserve one launch, but changed payload cannot reuse identity', () => {
  const state = fixture(); opening(state); opening(state); assert.equal(state.launches.length, 1);
  const bad = applyCommand(state, { type: 'create', opening: { id: 'opening-1', service: 'Haircut', stylist: 'Theo', startsAt: now + 3_600_000, durationMinutes: 30 } }, now);
  assert.equal(bad.ok, false);
});
test('no eligible candidates produces unfilled outcome with history', () => {
  const state = initialState([]); opening(state); const result = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now);
  assert.equal(result.opening?.status, 'unfilled'); assert.match(result.opening!.history.at(-1)!.message, /No eligible/);
});
test('decline moves to next eligible client, never retries same client even with duplicate entry', () => {
  const state = fixture(); state.entries.push({ ...state.entries[0], id: 'zz-duplicate' }); opening(state);
  const first = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  assert.equal(applyCommand(state, { type: 'decline', offerId: first.id }, now + 1).ok, true);
  const next = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now + 2).offer!;
  assert.equal(next.entryId, 'sample-2');
  assert.equal(applyCommand(state, { type: 'accept', offerId: first.id }, now + 3).ok, false);
  assert.equal(applyCommand(state, { type: 'decline', offerId: first.id }, now + 3).ok, true);
  assert.equal(state.openings['opening-1'].offerId, next.id);
});
test('timeout advances and delayed expiry cannot free a newer offer', () => {
  const state = fixture(); opening(state); const first = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  applyCommand(state, { type: 'expire', offerId: first.id }, first.expiresAt);
  const next = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, first.expiresAt).offer!;
  assert.equal(next.entryId, 'sample-2');
  applyCommand(state, { type: 'expire', offerId: first.id }, first.expiresAt + 1);
  assert.equal(next.status, 'active'); assert.equal(state.openings['opening-1'].offerId, next.id);
});
test('simulated permanent delivery failure releases client and advances with visible reason', () => {
  const state = fixture(); opening(state); state.openings['opening-1'].failFirstDelivery = true;
  const failed = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  assert.equal(failed.status, 'failed'); assert.equal(state.messages[0].delivery, 'failed');
  assert.equal(applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!.entryId, 'sample-2');
  opening(state, 'opening-2'); assert.equal(applyCommand(state, { type: 'claim', openingId: 'opening-2' }, now).offer!.entryId, 'sample-1');
});
test('all declines end unfilled with a full attempt history', () => {
  const state = fixture(); opening(state);
  for (let i = 0; i < 4; i++) { const offer = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!; applyCommand(state, { type: 'decline', offerId: offer.id }, now + 1); }
  const result = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now + 2);
  assert.equal(result.opening!.status, 'unfilled'); assert.equal(Object.keys(state.offers).length, 4);
  assert.equal(result.opening!.history.filter(e => e.message.includes('declined')).length, 4);
});
test('staff stop invalidates current link and prevents further offers', () => {
  const state = fixture(); opening(state); const first = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  applyCommand(state, { type: 'cancel', openingId: 'opening-1', reason: 'Original client returned' }, now + 1);
  assert.equal(applyCommand(state, { type: 'accept', offerId: first.id }, now + 2).ok, false);
  assert.equal(applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now + 2).opening!.status, 'canceled');
  assert.equal(Object.keys(state.offers).length, 1); assert.equal(state.entries[0].fulfilled, false);
});
test('accept/cancel in either order ends canceled with no stale confirmation or re-enrollment', () => {
  for (const cancelFirst of [true, false]) {
    const state = fixture(); opening(state); const offer = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
    const cancel = () => applyCommand(state, { type: 'cancel', openingId: 'opening-1', reason: 'Stylist unavailable' }, now + 1);
    const accept = () => applyCommand(state, { type: 'accept', offerId: offer.id }, now + 1);
    if (cancelFirst) { cancel(); assert.equal(accept().ok, false); } else { assert.equal(accept().ok, true); cancel(); }
    cancel();
    assert.equal(state.openings['opening-1'].status, 'canceled'); assert.equal(offer.status, 'canceled');
    assert.equal(state.entries[0].fulfilled, !cancelFirst);
    assert.equal(state.messages.filter(m => m.kind === 'cancellation').length, 1);
    assert.ok(state.messages.filter(m => m.kind === 'confirmation').every(m => m.delivery === 'superseded'));
  }
});
test('appointment cutoff ends outreach and quick demo uses explicitly shorter deadlines', () => {
  const state = fixture(); opening(state); state.openings['opening-1'].demoFast = true;
  const offer = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  assert.equal(offer.expiresAt, now + 10_000);
  applyCommand(state, { type: 'expire', offerId: offer.id }, now + 3_600_000);
  assert.equal(applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now + 3_600_000).opening!.status, 'unfilled');
});
test('serialized state preserves active claims, prior responses, pending work and fulfilled clients', () => {
  const state = fixture(); opening(state); const offer = applyCommand(state, { type: 'claim', openingId: 'opening-1' }, now).offer!;
  applyCommand(state, { type: 'accept', offerId: offer.id }, now + 1);
  opening(state, 'opening-2'); applyCommand(state, { type: 'claim', openingId: 'opening-2' }, now + 2);
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(restored, state);
  assert.equal(applyCommand(restored, { type: 'accept', offerId: offer.id }, now + 3).ok, true);
  opening(restored, 'opening-3'); assert.equal(applyCommand(restored, { type: 'claim', openingId: 'opening-3' }, now + 3).offer!.entryId, 'sample-3');
});
