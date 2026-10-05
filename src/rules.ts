import type { Command, Entry, Offer, Opening, Result, SalonState } from './types';
export const UNAVAILABLE = 'This opening is no longer available. Please contact the salon.';
export function initialState(entries: Entry[]): SalonState {
  return { schemaVersion: 2, entries, openings: {}, offers: {}, messages: [], launches: [], wakeups: [] };
}
function wake(state: SalonState, openingId: string) {
  // Do not deduplicate an in-flight wakeup: a later response must get its own Signal.
  state.wakeups.push(openingId);
}
function endOffer(state: SalonState, offer: Offer, now: number, status: 'expired' | 'declined', message: string) {
  offer.status = status;
  const opening = state.openings[offer.openingId];
  opening.status = 'pending';
  delete opening.offerId;
  opening.history.push({ at: now, message });
  wake(state, opening.id);
}
export function eligible(entry: Entry, opening: Opening): boolean {
  return entry.service === opening.service && (!entry.stylist || entry.stylist === opening.stylist)
    && entry.availableFrom <= opening.startsAt
    && entry.availableUntil >= opening.startsAt + opening.durationMinutes * 60_000;
}
// The coordinator calls this synchronously. Never await between checking and mutating a claim.
export function applyCommand(state: SalonState, command: Command, now: number): Result {
  if (command.type === 'create') {
    const input = command.opening;
    const existing = state.openings[input.id];
    if (existing) {
      const same = (['service', 'stylist', 'startsAt', 'durationMinutes', 'demoFast', 'failFirstDelivery'] as const).every(key => existing[key] === input[key]);
      return same ? { ok: true, opening: existing } : { ok: false, reason: 'Request ID already belongs to a different opening.' };
    }
    if (Object.keys(state.openings).length >= 100) return { ok: false, reason: 'This demo has reached 100 openings. Start a fresh demo salon to continue.' };
    if (input.startsAt <= now || input.durationMinutes <= 0) return { ok: false, reason: 'Choose a future appointment.' };
    const opening = state.openings[input.id] = { ...input, status: 'pending', history: [{ at: now, message: 'Opening added.' }] };
    state.launches.push(input.id);
    return { ok: true, opening };
  }
  if (command.type === 'cancel') {
    const opening = state.openings[command.openingId];
    if (!opening) return { ok: false, reason: 'Opening not found.' };
    if (opening.status === 'canceled') return { ok: true, opening };
    const wasBooked = opening.status === 'filled';
    const offer = opening.offerId ? state.offers[opening.offerId] : undefined;
    opening.status = 'canceled';
    opening.history.push({ at: now, message: `${wasBooked ? 'Booking canceled' : 'Outreach stopped'}: ${command.reason}` });
    if (offer && (offer.status === 'active' || offer.status === 'accepted')) {
      offer.status = 'canceled';
      for (const message of state.messages) {
        if (message.offerId === offer.id && message.delivery === 'simulated') message.delivery = 'superseded';
      }
      state.messages.push({ id: `${offer.id}/cancellation`, entryId: offer.entryId, offerId: offer.id, kind: 'cancellation', delivery: 'simulated', text: `${wasBooked ? 'Your appointment has been canceled' : 'This opening is no longer available'}. Please contact Juniper Salon to arrange another time.`, at: now });
    }
    // Fulfilled entries stay fulfilled after cancellation; no automatic re-enrollment.
    wake(state, opening.id);
    return { ok: true, opening, offer };
  }
  if (command.type === 'claim') {
    const opening = state.openings[command.openingId];
    if (!opening) return { ok: false, reason: 'Opening not found.' };
    if (opening.offerId) return { ok: true, opening, offer: state.offers[opening.offerId] };
    if (opening.status !== 'pending') return { ok: true, opening };
    const clientFor = (offer: Offer) => state.entries.find(e => e.id === offer.entryId)!.clientId;
    const busy = new Set(Object.values(state.offers).filter(o => o.status === 'active').map(clientFor));
    const tried = new Set(Object.values(state.offers).filter(o => o.openingId === opening.id).map(clientFor));
    const fulfilled = new Set(state.entries.filter(e => e.fulfilled).map(e => e.clientId));
    const entry = opening.startsAt > now ? state.entries.filter(e => !fulfilled.has(e.clientId) && !busy.has(e.clientId) && !tried.has(e.clientId) && eligible(e, opening)).sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] : undefined;
    if (!entry) {
      opening.status = 'unfilled';
      opening.history.push({ at: now, message: opening.startsAt <= now ? 'Appointment start time reached. Outreach ended.' : 'No eligible, available clients remain. Outreach ended.' });
      return { ok: true, opening };
    }
    const failed = !!opening.failFirstDelivery && tried.size === 0;
    const offer = state.offers[`${opening.id}/offer/${entry.id}`] = {
      id: `${opening.id}/offer/${entry.id}`, openingId: opening.id, entryId: entry.id,
      expiresAt: Math.min(now + (opening.demoFast ? 10_000 : 900_000), opening.startsAt), status: failed ? 'failed' : 'active',
    };
    if (!failed) { opening.status = 'offering'; opening.offerId = offer.id; }
    opening.history.push({ at: now, message: failed ? `Could not deliver to ${entry.name} (simulated failure). Moving to the next client.` : `Offered to ${entry.name}${opening.demoFast ? ' (10-second demo)' : ''}.` });
    state.messages.push({ id: `${offer.id}/text`, entryId: entry.id, offerId: offer.id, kind: 'offer', delivery: failed ? 'failed' : 'simulated', text: `Hi ${entry.name}, an earlier ${opening.service.toLowerCase()} appointment is available at Juniper Salon. Open your private link to view it.`, at: now });
    return { ok: true, opening, offer };
  }
  const offer = state.offers[command.offerId];
  if (!offer) return { ok: false, reason: UNAVAILABLE };
  const opening = state.openings[offer.openingId];
  if (command.type === 'accept' && offer.status === 'accepted' && opening.status === 'filled') return { ok: true, opening, offer };
  if (command.type === 'decline' && offer.status === 'declined') return { ok: true, opening, offer };
  if (command.type === 'expire' && offer.status === 'expired') return { ok: true, opening, offer };
  if (offer.status !== 'active' || opening.status !== 'offering' || opening.offerId !== offer.id) return { ok: false, reason: UNAVAILABLE };
  const entry = state.entries.find(e => e.id === offer.entryId)!;
  if (now >= offer.expiresAt) {
    endOffer(state, offer, now, 'expired', `${entry.name} did not respond before the deadline. Moving to the next client.`);
    return { ok: command.type === 'expire', reason: UNAVAILABLE, opening, offer };
  }
  if (command.type === 'expire') return { ok: false, reason: 'The offer has not expired.' };
  if (command.type === 'decline') {
    endOffer(state, offer, now, 'declined', `${entry.name} declined. Moving to the next client.`);
    return { ok: true, opening, offer };
  }
  if (state.entries.some(e => e.clientId === entry.clientId && e.fulfilled)) return { ok: false, reason: 'This client has already booked an appointment.' };
  offer.status = 'accepted'; opening.status = 'filled';
  state.entries.filter(e => e.clientId === entry.clientId).forEach(e => { e.fulfilled = true; });
  opening.history.push({ at: now, message: `Confirmed for ${entry.name}. Please update the salon calendar.` });
  state.messages.push({ id: `${offer.id}/confirmation`, entryId: entry.id, offerId: offer.id, kind: 'confirmation', delivery: 'simulated', text: `You're booked, ${entry.name}. We look forward to seeing you at Juniper Salon.`, at: now });
  wake(state, opening.id);
  return { ok: true, opening, offer };
}
