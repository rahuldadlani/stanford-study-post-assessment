import type { Command, Entry, Result, SalonState } from './types';

export function initialState(entries: Entry[]): SalonState {
  return { entries, openings: {}, offers: {}, messages: [], launches: [], wakeups: [] };
}

// All checks and mutations run synchronously in the coordinator Update handler.
// No Activity or await may split a reservation or booking transition.
export function applyCommand(state: SalonState, command: Command, now: number): Result {
  if (command.type === 'create') {
    const input = command.opening;
    const existing = state.openings[input.id];
    if (existing) {
      const same = ['service', 'stylist', 'startsAt', 'durationMinutes'].every(key => existing[key as keyof typeof input] === input[key as keyof typeof input]);
      return same ? { ok: true, opening: existing } : { ok: false, reason: 'Request ID already belongs to a different opening.' };
    }
    if (input.startsAt <= now || input.durationMinutes <= 0) return { ok: false, reason: 'Choose a future appointment.' };
    const opening = state.openings[input.id] = { ...input, status: 'pending', history: [{ at: now, message: 'Opening added.' }] };
    state.launches.push(input.id);
    return { ok: true, opening };
  }
  if (command.type === 'claim') {
    const opening = state.openings[command.openingId];
    if (!opening) return { ok: false, reason: 'Opening not found.' };
    if (opening.offerId) return { ok: true, opening, offer: state.offers[opening.offerId] };
    if (opening.status !== 'pending') return { ok: true, opening };
    const busy = new Set(Object.values(state.offers).filter(o => o.status === 'active').map(o => state.entries.find(e => e.id === o.entryId)!.clientId));
    const fulfilled = new Set(state.entries.filter(e => e.fulfilled).map(e => e.clientId));
    const entry = opening.startsAt > now ? state.entries.filter(e => !fulfilled.has(e.clientId) && !busy.has(e.clientId) && e.service === opening.service && (!e.stylist || e.stylist === opening.stylist) && e.availableFrom <= opening.startsAt && e.availableUntil >= opening.startsAt + opening.durationMinutes * 60_000).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0] : undefined;
    if (!entry) {
      opening.status = 'unfilled';
      opening.history.push({ at: now, message: 'No eligible, available clients remain.' });
      return { ok: true, opening };
    }
    const offer = state.offers[`${opening.id}/offer/${entry.id}`] = { id: `${opening.id}/offer/${entry.id}`, openingId: opening.id, entryId: entry.id, expiresAt: Math.min(now + 15 * 60_000, opening.startsAt), status: 'active' };
    opening.status = 'offering';
    opening.offerId = offer.id;
    opening.history.push({ at: now, message: `Offered to ${entry.name}.` });
    state.messages.push({ id: `${offer.id}/text`, entryId: entry.id, offerId: offer.id, kind: 'offer', text: `Hi ${entry.name}, an earlier ${opening.service.toLowerCase()} appointment is available at Juniper Salon. Open your private link to view it.`, at: now });
    return { ok: true, opening, offer };
  }
  const offer = state.offers[command.offerId];
  if (!offer) return { ok: false, reason: 'This opening is no longer available. Please contact the salon.' };
  const opening = state.openings[offer.openingId];
  if (command.type === 'accept' && offer.status === 'accepted' && opening.status === 'filled') return { ok: true, opening, offer };
  if (offer.status !== 'active' || opening.status !== 'offering' || opening.offerId !== offer.id) return { ok: false, reason: 'This opening is no longer available. Please contact the salon.' };
  if (now >= offer.expiresAt) {
    offer.status = 'expired';
    opening.status = 'unfilled';
    opening.history.push({ at: now, message: 'Offer timed out. Automatic progression is pending the next implementation stage.' });
    state.wakeups.push(opening.id);
    return { ok: command.type === 'expire', reason: 'This opening is no longer available. Please contact the salon.', opening, offer };
  }
  if (command.type === 'expire') return { ok: false, reason: 'The offer has not expired.' };
  const entry = state.entries.find(e => e.id === offer.entryId)!;
  if (state.entries.some(e => e.clientId === entry.clientId && e.fulfilled)) return { ok: false, reason: 'This client has already booked an appointment.' };
  offer.status = 'accepted';
  opening.status = 'filled';
  // A duplicate waitlist row must not permit a second booking.
  state.entries.filter(e => e.clientId === entry.clientId).forEach(e => { e.fulfilled = true; });
  opening.history.push({ at: now, message: `Confirmed for ${entry.name}. Please update the salon calendar.` });
  state.messages.push({ id: `${offer.id}/confirmation`, entryId: entry.id, offerId: offer.id, kind: 'confirmation', text: `You're booked, ${entry.name}. We look forward to seeing you at Juniper Salon.`, at: now });
  state.wakeups.push(opening.id);
  return { ok: true, opening, offer };
}
