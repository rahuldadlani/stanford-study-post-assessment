export type Entry = { id: string; clientId: string; name: string; mobile: string; service: string; stylist?: string; availableFrom: number; availableUntil: number; joinedAt: number; fulfilled: boolean };
export type Opening = { id: string; service: string; stylist: string; startsAt: number; durationMinutes: number; status: 'pending' | 'offering' | 'filled' | 'unfilled'; offerId?: string; history: { at: number; message: string }[] };
export type Offer = { id: string; openingId: string; entryId: string; expiresAt: number; status: 'active' | 'accepted' | 'expired' };
export type Message = { id: string; entryId: string; offerId: string; kind: 'offer' | 'confirmation'; text: string; at: number };
export type SalonState = { entries: Entry[]; openings: Record<string, Opening>; offers: Record<string, Offer>; messages: Message[]; launches: string[]; wakeups: string[] };
export type Command =
  | { type: 'create'; opening: Omit<Opening, 'status' | 'history' | 'offerId'> }
  | { type: 'claim'; openingId: string }
  | { type: 'accept'; offerId: string }
  | { type: 'expire'; offerId: string };
export type Result = { ok: boolean; reason?: string; opening?: Opening; offer?: Offer };
export type OpeningInput = { openingId: string; coordinatorId: string; taskQueue: string };
export type DemoStatus = { requestId: string; phase: 'started' | 'waiting' | 'complete'; message: string };
