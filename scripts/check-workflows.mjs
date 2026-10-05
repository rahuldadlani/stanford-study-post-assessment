import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
process.env.SWC_NATIVE_BINDING_CACHE ??= join(realpathSync(tmpdir()), 'juniper-swc-cache');
const { bundleWorkflowCode } = await import('@temporalio/worker');
const bundle = await bundleWorkflowCode({ workflowsPath: resolve('src/workflows.ts') });
console.log(`Temporal Workflow bundle compiled: ${bundle.code.length} bytes.`);
