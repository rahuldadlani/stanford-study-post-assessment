import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker, bundleWorkflowCode } from '@temporalio/worker';
import { createActivities } from '../src/activities';
import { createApp } from '../src/api';
import { seedEntries } from '../src/seed';
import type { Command, Entry, Offer, Result, SalonState } from '../src/types';

let env: TestWorkflowEnvironment;
let worker: Worker;
let running: Promise<void>;
let bundle: Awaited<ReturnType<typeof bundleWorkflowCode>>;
const queue = `verify-juniper-${randomUUID()}`;
const tracked: string[] = [];
const servers: Server[] = [];
async function startWorker() {
  worker = await Worker.create({ connection: env.nativeConnection, taskQueue: queue, workflowBundle: bundle, activities: createActivities(env.client) });
  running = worker.run();
  // Attach a rejection handler immediately; failures still propagate when awaiting running.
  void running.catch(() => {});
}
before(async () => {
  env = process.env.TEST_TEMPORAL_ADDRESS
    ? await TestWorkflowEnvironment.createFromExistingServer({ address: process.env.TEST_TEMPORAL_ADDRESS })
    : await TestWorkflowEnvironment.createTimeSkipping();
  bundle = await bundleWorkflowCode({ workflowsPath: require.resolve('../src/workflows') });
  await startWorker();
});
after(async () => {
  await Promise.all(servers.map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  if (env) {
    for (const id of tracked.reverse()) {
      try { await env.client.workflow.getHandle(id).terminate('Verification cleanup'); } catch { /* already completed */ }
    }
  }
  if (worker) { worker.shutdown(); await running; }
  if (env) await env.teardown();
});
async function until<T>(fn: () => Promise<T | undefined | false>, timeout = 25_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timed out waiting for Temporal state');
}
async function salon(entries: Entry[] = seedEntries(Date.now()), rollover = 100) {
  const id = `${queue}/${randomUUID()}`;
  await env.client.workflow.start('salonWorkflowV2', { workflowId: id, taskQueue: queue, args: [entries, undefined, rollover] });
  tracked.push(id);
  // Get a handle without a first-execution Run ID, so Updates follow Continue-As-New.
  const handle = env.client.workflow.getHandle(id);
  const command = (cmd: Command) => handle.executeUpdate<Result, [Command]>('salonCommand', { args: [cmd] });
  const state = () => handle.query<SalonState>('salonSnapshot');
  const create = async (options: { demoFast?: boolean; failFirstDelivery?: boolean; stylist?: string } = {}) => {
    const openingId = `${id}/opening/${randomUUID()}`; tracked.push(openingId);
    const result = await command({ type: 'create', opening: { id: openingId, service: 'Haircut', stylist: 'Elena', startsAt: Date.now() + 3_600_000, durationMinutes: 30, ...options } });
    assert.equal(result.ok, true); return openingId;
  };
  const offer = (openingId: string, previous?: string) => until(async () => {
    const s = await state(); const current = s.openings[openingId]?.offerId;
    return current && current !== previous && s.offers[current].status === 'active' ? s.offers[current] : undefined;
  });
  return { id, handle, command, state, create, offer };
}

test('Temporal: earliest matching client, concurrent duplicate accept, completed opening, post-booking cancellation', { timeout: 60_000 }, async () => {
  const entries = seedEntries(Date.now()); entries[0].stylist = 'Theo';
  const s = await salon(entries); const id = await s.create(); const offer = await s.offer(id);
  assert.equal(offer.entryId, 'sample-2');
  const replies = await Promise.all([1, 2].map(() => s.command({ type: 'accept', offerId: offer.id })));
  assert.ok(replies.every(r => r.ok));
  assert.equal(await env.client.workflow.getHandle(id).result(), 'filled');
  let state = await s.state();
  assert.equal(state.messages.filter(m => m.kind === 'confirmation').length, 1);
  assert.equal(state.entries[1].fulfilled, true);
  await s.command({ type: 'cancel', openingId: id, reason: 'Stylist unavailable' });
  state = await s.state();
  assert.equal(state.openings[id].status, 'canceled'); assert.equal(state.offers[offer.id].status, 'canceled');
  assert.equal(state.messages.filter(m => m.kind === 'cancellation').length, 1);
  assert.equal((await s.command({ type: 'accept', offerId: offer.id })).ok, false);
});

test('Temporal: concurrent openings reserve different clients, including duplicate waitlist rows', { timeout: 60_000 }, async () => {
  const entries = seedEntries(Date.now()); entries.push({ ...entries[0], id: 'duplicate' });
  const s = await salon(entries); const ids = await Promise.all([s.create(), s.create()]);
  const offers = await Promise.all(ids.map(id => s.offer(id)));
  const clients = offers.map(o => entries.find(e => e.id === o.entryId)!.clientId);
  assert.equal(new Set(clients).size, 2);
  await Promise.all(ids.map(openingId => s.command({ type: 'cancel', openingId, reason: 'Verification finished' })));
});

test('Temporal: failed delivery, decline, timeout and exhaustion progress automatically; old links cannot book', { timeout: 60_000 }, async () => {
  const s = await salon(); const id = await s.create({ failFirstDelivery: true, demoFast: true });
  const second = await s.offer(id); assert.equal(second.entryId, 'sample-2');
  assert.equal((await s.state()).offers[`${id}/offer/sample-1`].status, 'failed');
  await s.command({ type: 'decline', offerId: second.id });
  const third = await s.offer(id, second.id); assert.equal(third.entryId, 'sample-3');
  // Real durable timer, not an expire command or a browser clock.
  const fourth = await s.offer(id, third.id); assert.equal(fourth.entryId, 'sample-4');
  assert.equal((await s.state()).offers[third.id].status, 'expired');
  assert.equal((await s.command({ type: 'accept', offerId: third.id })).ok, false);
  await s.command({ type: 'decline', offerId: fourth.id });
  assert.equal(await env.client.workflow.getHandle(id).result(), 'unfilled');
  assert.equal(Object.keys((await s.state()).offers).length, 4);
});

test('Temporal: acceptance racing cancellation always leaves a canceled, unavailable opening', { timeout: 60_000 }, async () => {
  const s = await salon(); const id = await s.create(); const offer = await s.offer(id);
  await Promise.all([s.command({ type: 'accept', offerId: offer.id }), s.command({ type: 'cancel', openingId: id, reason: 'Original client returned' })]);
  const state = await s.state(); assert.equal(state.openings[id].status, 'canceled');
  assert.equal((await s.command({ type: 'accept', offerId: offer.id })).ok, false);
  assert.equal(state.messages.filter(m => m.kind === 'cancellation').length, 1);
  assert.ok(state.messages.filter(m => m.kind === 'confirmation').every(m => m.delivery === 'superseded'));
});

test('Temporal: worker shutdown and restart retains the original offer deadline and history', { timeout: 90_000 }, async () => {
  const s = await salon(); const id = await s.create(); const offer = await s.offer(id);
  // Ensure launch and wakeup Activities have settled before shutting down.
  await until(async () => (await s.state()).launches.length === 0);
  const beforeState = await s.state();
  worker.shutdown(); await running;
  await new Promise(resolve => setTimeout(resolve, 300));
  await startWorker();
  const recovered = await s.state();
  assert.deepEqual(recovered.offers[offer.id], offer);
  assert.deepEqual(recovered.openings[id].history, beforeState.openings[id].history);
  await s.command({ type: 'decline', offerId: offer.id });
  assert.equal((await s.offer(id, offer.id)).entryId, 'sample-2');
  await s.command({ type: 'cancel', openingId: id, reason: 'Restart verified' });
});

test('Temporal: Continue-As-New preserves claims, outcomes, pending starts and repeat acceptance', { timeout: 90_000 }, async () => {
  const s = await salon(undefined, 3); const originalRun = (await s.handle.describe()).runId;
  const firstId = await s.create(); const first = await s.offer(firstId);
  await s.command({ type: 'accept', offerId: first.id });
  const secondId = await s.create(); const second = await s.offer(secondId);
  assert.equal(second.entryId, 'sample-2');
  await until(async () => (await s.handle.describe()).runId !== originalRun);
  assert.equal((await s.command({ type: 'accept', offerId: first.id })).ok, true);
  const state = await s.state(); assert.equal(state.entries[0].fulfilled, true);
  assert.equal(state.offers[second.id].expiresAt, second.expiresAt);
  assert.equal(state.messages.filter(m => m.kind === 'confirmation').length, 1);
  await s.command({ type: 'cancel', openingId: secondId, reason: 'Rollover verified' });
});

test('HTTP + Temporal: staff isolation, validation, private-link privacy, retry, decline and cancellation', { timeout: 90_000 }, async () => {
  const s = await salon();
  const server = createApp(env.client, s.id).listen(0, '127.0.0.1'); servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  async function request(path: string, method = 'GET', body?: unknown, staff = true, origin?: string) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(staff && cookie ? { cookie } : {}), ...(origin ? { origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() as any, cookie: response.headers.get('set-cookie') };
  }
  assert.equal((await request('/api/staff/state')).status, 401);
  assert.equal((await request('/api/staff/session', 'POST', { password: 'wrong' })).status, 401);
  const login = await request('/api/staff/session', 'POST', { password: process.env.STAFF_PASSWORD ?? 'juniper-demo' });
  assert.equal(login.status, 200); cookie = login.cookie!.split(';')[0];
  assert.equal((await request('/api/staff/openings', 'POST', {})).status, 400);
  assert.equal((await request('/api/staff/cancel', 'POST', {}, true, 'https://elsewhere.example')).status, 403);
  // Use Workflow creation to keep HTTP tests independent of the midnight same-day boundary.
  const id = await s.create(); const first = await s.offer(id);
  const link = async (offer: Offer) => (await request('/api/staff/state')).body.messages.find((m: any) => m.offerId === offer.id).url.split('#')[1];
  const token = await link(first);
  const view = await request(`/api/offers/${token}`, 'GET', undefined, false);
  assert.deepEqual(Object.keys(view.body).sort(), ['status', 'service', 'stylist', 'startsAt', 'durationMinutes', 'expiresAt'].sort());
  assert.equal((await request(`/api/offers/${token}x`, 'GET', undefined, false)).status, 404);
  assert.equal((await request(`/api/offers/${token}/respond`, 'POST', { response: 'decline' }, false)).status, 200);
  assert.equal((await request(`/api/offers/${token}/respond`, 'POST', { response: 'accept' }, false)).status, 409);
  const second = await s.offer(id, first.id); const nextToken = await link(second);
  const accepted = await Promise.all([1, 2].map(() => request(`/api/offers/${nextToken}/respond`, 'POST', { response: 'accept' }, false)));
  assert.ok(accepted.every(r => r.status === 200 && r.body.status === 'accepted'));
  assert.deepEqual(Object.keys(accepted[0].body).sort(), ['ok', 'status']);
  assert.equal((await request('/api/staff/cancel', 'POST', { openingId: id, reason: 'Stylist unavailable' })).status, 200);
  assert.equal((await request(`/api/offers/${nextToken}`, 'GET', undefined, false)).body.status, 'canceled');
  assert.equal((await request(`/api/offers/${nextToken}/respond`, 'POST', { response: 'accept' }, false)).status, 409);
});
