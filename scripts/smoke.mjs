import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client, Connection } from '@temporalio/client';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
let cookie = '';
async function request(path, method = 'GET', data, authenticated = true) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(authenticated && cookie ? { cookie } : {}) }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(20_000) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
}
async function until(fn) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error('Timed out waiting for the real Temporal workflow. Check the Worker terminal.');
}
const login = await request('/api/staff/session', 'POST', { password: process.env.STAFF_PASSWORD ?? 'juniper-demo' });
assert.equal(login.status, 200); cookie = login.cookie.split(';')[0];
assert.equal((await request('/api/staff/state', 'GET', undefined, false)).status, 401);
const before = (await request('/api/staff/state')).body;
const created = await request('/api/staff/openings', 'POST', { requestId: randomUUID(), service: 'Haircut', stylist: 'Elena', startsAt: Date.now() + 5 * 60_000, durationMinutes: 30 });
assert.equal(created.status, 201, JSON.stringify(created.body));
const openingId = created.body.opening.id;
const offered = await until(async () => {
  const state = (await request('/api/staff/state')).body;
  assert.notEqual(state.openings[openingId]?.status, 'unfilled', 'No available sample clients. Use a new SALON_WORKFLOW_ID to start a fresh demo.');
  const offerId = state.openings[openingId]?.offerId;
  return offerId ? { state, offer: state.offers[offerId] } : undefined;
});
const text = offered.state.messages.find(m => m.offerId === offered.offer.id && m.kind === 'offer');
assert.ok(text);
const token = text.url.split('#')[1];
const publicOffer = await request('/api/offers/' + token, 'GET', undefined, false);
assert.equal(publicOffer.status, 200);
assert.deepEqual(Object.keys(publicOffer.body).sort(), ['status','service','stylist','startsAt','durationMinutes','expiresAt'].sort());
const replies = await Promise.all([1, 2].map(() => request('/api/offers/' + token + '/respond', 'POST', { response: 'accept' }, false)));
assert.ok(replies.every(r => r.status === 200 && r.body.status === 'accepted'));
const final = (await request('/api/staff/state')).body;
assert.equal(final.openings[openingId].status, 'filled');
assert.equal(final.entries.find(e => e.id === offered.offer.entryId).fulfilled, true);
assert.equal(final.messages.filter(m => m.offerId === offered.offer.id && m.kind === 'confirmation').length, 1);
assert.equal((await request('/api/offers/' + token + 'x', 'GET', undefined, false)).status, 404);
const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
let workflowStatus;
try {
  const client = new Client({ connection });
  workflowStatus = await until(async () => { const status = (await client.workflow.getHandle(openingId).describe()).status.name; return status === 'COMPLETED' ? status : undefined; });
} finally { await connection.close(); }
const evidence = { timestamp: new Date().toISOString(), base, coordinatorId: before.coordinatorId, openingId, offerId: offered.offer.id, selectedClient: final.entries.find(e => e.id === offered.offer.entryId).name, workflowStatus, opening: final.openings[openingId], checks: ['Staff access enforced', 'Opening launched by coordinator', 'Offer reserved and simulated text recorded', 'Private view has only appointment fields', 'Concurrent repeat acceptance returns success twice', 'One confirmation message', 'Entry fulfilled and staff opening filled', 'Tampered link rejected', 'Opening Workflow completed in Temporal'] };
await mkdir('docs/evidence', { recursive: true });
await writeFile('docs/evidence/first-slice-smoke.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
