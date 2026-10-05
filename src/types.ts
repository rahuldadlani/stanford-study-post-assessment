export type Entry = {
  id: string; clientId: string; name: string; mobile: string; service: string;
  stylist?: string; availableFrom: number; availableUntil: number; joinedAt: number; fulfilled: boolean;
};
export type OpeningInputData = {
  id: string; service: string; stylist: string; startsAt: number; durationMinutes: number;
  demoFast?: boolean; failFirstDelivery?: boolean;
};
export type Opening = OpeningInputData & {
  status: 'pending' | 'offering' | 'filled' | 'unfilled' | 'canceled';
  offerId?: string; history: { at: number; message: string }[];
};
export type Offer = {
  id: string; openingId: string; entryId: string; expiresAt: number;
  status: 'active' | 'accepted' | 'expired' | 'declined' | 'failed' | 'canceled';
};
export type Message = {
  id: string; entryId: string; offerId: string; kind: 'offer' | 'confirmation' | 'cancellation';
  text: string; at: number; delivery: 'simulated' | 'failed' | 'superseded';
};
export type SalonState = {
  schemaVersion: 2; entries: Entry[]; openings: Record<string, Opening>; offers: Record<string, Offer>;
  messages: Message[]; launches: string[]; wakeups: string[];
};
export type Command =
  | { type: 'create'; opening: OpeningInputData }
  | { type: 'claim'; openingId: string }
  | { type: 'cancel'; openingId: string; reason: string }
  | { type: 'accept' | 'decline' | 'expire'; offerId: string };
export type Result = { ok: boolean; reason?: string; opening?: Opening; offer?: Offer };
export type OpeningInput = { openingId: string; coordinatorId: string; taskQueue: string };
export type DemoStatus = { requestId: string; phase: 'started' | 'waiting' | 'complete'; message: string };
