import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
const stages = [
  ['TypeScript', ['run', 'typecheck']],
  ['Local rules and access', ['test']],
  ['Workflow bundle', ['run', 'check:workflows']],
  ['Temporal and HTTP integration', ['run', 'test:integration']],
];
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(e => e.isDirectory() ? files(`${directory}/${e.name}`) : [`${directory}/${e.name}`]));
  return nested.flat();
}
const hash = createHash('sha256');
for (const path of [...(await Promise.all(['src', 'public', 'tests', 'scripts'].map(files))).flat(), 'package.json', 'package-lock.json'].sort()) { hash.update(path); hash.update(await readFile(path)); }
const report = { timestamp: new Date().toISOString(), sourceSha256: hash.digest('hex'), stages: [], passed: false };
await mkdir('docs/evidence', { recursive: true });
for (const [name, args] of stages) {
  console.log(`Running ${name}…`);
  const run = spawnSync('npm', args, { encoding: 'utf8', env: { ...process.env, TEST_TEMPORAL_ADDRESS: process.env.TEST_TEMPORAL_ADDRESS ?? '127.0.0.1:7233' }, timeout: 240_000 });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? '\n' + run.error.message : ''}`;
  process.stdout.write(output);
  report.stages.push({ name, passed: run.status === 0, exitCode: run.status, output });
}
report.passed = report.stages.every(stage => stage.passed);
await writeFile('docs/evidence/verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Evidence saved. Overall result: ${report.passed ? 'PASS' : 'NOT VERIFIED — inspect failing stages'}`);
process.exitCode = report.passed ? 0 : 1;
