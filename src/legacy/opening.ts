import { condition, proxyActivities, setHandler } from '@temporalio/workflow';
import type { createActivities } from './activities';
import { offerChanged } from './messages';
import type { OpeningInput } from './types';
const activities = proxyActivities<ReturnType<typeof createActivities>>({ startToCloseTimeout: '15 seconds', retry: { maximumInterval: '10 seconds' } });
export async function openingWorkflow(input: OpeningInput): Promise<string> {
  let changed = false;
  setHandler(offerChanged, () => { changed = true; });
  const result = await activities.command(input.coordinatorId, { type: 'claim', openingId: input.openingId });
  if (!result.offer || result.offer.status !== 'active') return result.opening?.status ?? 'unfilled';
  const notified = await condition(() => changed, Math.max(0, result.offer.expiresAt - Date.now()));
  if (!notified) await activities.command(input.coordinatorId, { type: 'expire', offerId: result.offer.id });
  const final = await activities.command(input.coordinatorId, { type: 'claim', openingId: input.openingId });
  return final.opening?.status ?? 'unfilled';
}
