import { allHandlersFinished, condition, continueAsNew, proxyActivities, setHandler, sleep, workflowInfo } from '@temporalio/workflow';
import type { createActivities } from './activities';
import { salonCommand, salonSnapshot } from './messages';
import { applyCommand, initialState } from './rules';
import type { Entry, SalonState } from './types';
const activities = proxyActivities<ReturnType<typeof createActivities>>({ startToCloseTimeout: '10 seconds', retry: { initialInterval: '1 second', maximumInterval: '5 seconds', maximumAttempts: 3 } });
export async function salonWorkflowV2(entries: Entry[], restored?: SalonState, rolloverAfter = 100): Promise<void> {
  const state = restored ?? initialState(entries);
  let operations = 0;
  setHandler(salonSnapshot, () => state);
  setHandler(salonCommand, command => { operations++; return applyCommand(state, command, Date.now()); });
  for (;;) {
    await condition(() => state.launches.length > 0 || state.wakeups.length > 0 || operations >= rolloverAfter || workflowInfo().continueAsNewSuggested);
    if (operations >= rolloverAfter || workflowInfo().continueAsNewSuggested) {
      await condition(allHandlersFinished);
      // All business IDs, old offer outcomes, fulfilled entries and pending effects survive.
      await continueAsNew<typeof salonWorkflowV2>([], state, rolloverAfter);
    }
    let retry = false;
    if (state.launches.length) {
      try {
        await activities.launchOpeningV2({ openingId: state.launches[0], coordinatorId: workflowInfo().workflowId, taskQueue: workflowInfo().taskQueue });
        state.launches.shift();
      } catch { retry = true; } // Keep durable intent; try wakeups even when starting an opening fails.
    }
    if (state.wakeups.length) {
      try { await activities.wakeOpening(state.wakeups[0]); state.wakeups.shift(); }
      catch { retry = true; }
    }
    if (retry) await sleep('1 second');
  }
}
