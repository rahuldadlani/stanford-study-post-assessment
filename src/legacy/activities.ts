import { Client, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import type { Command, OpeningInput, Result } from './types';
export function createActivities(client: Client) {
  return {
    async command(coordinatorId: string, command: Command): Promise<Result> {
      return client.workflow.getHandle(coordinatorId).executeUpdate('salonCommand', { args: [command] });
    },
    async launchOpening(input: OpeningInput): Promise<void> {
      try {
        await client.workflow.start('openingWorkflow', { workflowId: input.openingId, taskQueue: input.taskQueue, args: [input], workflowIdReusePolicy: 'REJECT_DUPLICATE' });
      } catch (error) { if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error; }
    },
    async wakeOpening(openingId: string): Promise<void> {
      try { await client.workflow.getHandle(openingId).signal('offerChanged'); }
      catch (error) {
        // Completed opening workflows need no wakeup. Other failures must retry.
        if (!(error instanceof Error) || error.name !== 'WorkflowNotFoundError') throw error;
      }
    },
  };
}
