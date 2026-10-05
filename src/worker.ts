import { NativeConnection, Worker } from '@temporalio/worker';
import { Client, Connection } from '@temporalio/client';
import { createActivities } from './activities';
async function run(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  const connection = await NativeConnection.connect({ address });
  const clientConnection = await Connection.connect({ address });
  const worker = await Worker.create({ connection, namespace: 'default', taskQueue: process.env.TASK_QUEUE ?? 'juniper-salon-v2', workflowsPath: require.resolve('./workflows'), activities: createActivities(new Client({ connection: clientConnection })) });
  console.log('Juniper Worker is ready.');
  try { await worker.run(); } finally { await clientConnection.close(); await connection.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
