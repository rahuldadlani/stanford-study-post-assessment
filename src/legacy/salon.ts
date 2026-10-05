import { condition, proxyActivities, setHandler, workflowInfo } from '@temporalio/workflow';
import type { createActivities } from './activities';
import { salonCommand, salonSnapshot } from './messages';
import { applyCommand, initialState } from './rules';
import type { Entry } from './types';
const activities = proxyActivities<ReturnType<typeof createActivities>>({ startToCloseTimeout: '15 seconds', retry: { initialInterval: '1 second', maximumInterval: '10 seconds' } });
export async function salonWorkflow(entries: Entry[]): Promise<void> {
  const state = initialState(entries);
  setHandler(salonSnapshot, () => state);
  setHandler(salonCommand, command => applyCommand(state, command, Date.now()));
  for (;;) {
    await condition(() => state.launches.length > 0 || state.wakeups.length > 0);
    if (state.launches.length) {
      const openingId = state.launches[0];
      await activities.launchOpening({ openingId, coordinatorId: workflowInfo().workflowId, taskQueue: workflowInfo().taskQueue });
      state.launches.shift();
    }
    if (state.wakeups.length) {
      await activities.wakeOpening(state.wakeups[0]);
      state.wakeups.shift();
    }
  }
}
