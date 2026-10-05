import type { Entry } from './types';
export function seedEntries(now: number): Entry[] {
  return ['Maya Chen', 'Jordan Lee', 'Sam Rivera', 'Alex Brooks'].map((name, i) => ({
    id: `sample-${i + 1}`, clientId: `client-${i + 1}`, name, mobile: `+15550100${String(i + 1).padStart(3, '0')}`, service: 'Haircut',
    availableFrom: now, availableUntil: now + 7 * 86_400_000, joinedAt: now - (4 - i) * 86_400_000, fulfilled: false,
  }));
}
