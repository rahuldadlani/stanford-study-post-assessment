import { condition, proxyActivities, setHandler } from '@temporalio/workflow';
import type { createActivities } from './activities';
import { offerChanged } from './messages';
import type { OpeningInput } from './types';
const activities = proxyActivities<ReturnType<typeof createActivities>>({ startToCloseTimeout: '15 seconds', retry: { maximumInterval: '10 seconds' } });
export async function openingWorkflowV2(input: OpeningInput): Promise<string> {
  let revision = 0;
  setHandler(offerChanged, () => { revision++; });
  for (;;) {
    // Capture BEFORE the Activity: a response during it must not become a lost wakeup.
    const observed = revision;
    const result = await activities.command(input.coordinatorId, { type: 'claim', openingId: input.openingId });
    if (!result.ok) throw new Error(result.reason);
    if (result.opening?.status !== 'pending' && result.opening?.status !== 'offering') return result.opening?.status ?? 'unfilled';
    if (!result.offer || result.offer.status !== 'active') continue;
    const changed = await condition(() => revision !== observed, Math.max(0, result.offer.expiresAt - Date.now()));
    if (!changed) await activities.command(input.coordinatorId, { type: 'expire', offerId: result.offer.id });
  }
}
