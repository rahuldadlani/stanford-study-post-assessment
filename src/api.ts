import express from 'express';
import path from 'node:path';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { readToken, signToken, staffCookie, validSession } from './access';
import { seedEntries } from './seed';
import type { Command, Result, SalonState } from './types';

export function createApp(client: Client, coordinatorId: string) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) { res.status(403).json({ error: 'Please use the Juniper Salon page to submit this request.' }); return; }
    next();
  });
  const handle = client.workflow.getHandle(coordinatorId);
  const snapshot = () => handle.query<SalonState>('salonSnapshot');
  const command = (input: Command) => client.connection.withDeadline(Date.now() + 15_000, () => handle.executeUpdate<Result, [Command]>('salonCommand', { args: [input] }));
  app.post('/api/staff/session', (req, res) => {
    if (req.body?.password !== (process.env.STAFF_PASSWORD ?? 'juniper-demo')) { res.status(401).json({ error: 'That staff password did not match.' }); return; }
    res.set('Set-Cookie', staffCookie()).json({ ok: true });
  });
  app.delete('/api/staff/session', (_req, res) => { res.set('Set-Cookie', 'juniper_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0').json({ ok: true }); });
  app.use('/api/staff', (req, res, next) => { if (!validSession(req.headers.cookie)) { res.status(401).json({ error: 'Please sign in as staff.' }); return; } next(); });
  app.get('/api/staff/state', async (_req, res) => {
    const state = await snapshot();
    res.json({ ...state, messages: state.messages.map(message => ({ ...message, url: message.delivery === 'failed' ? undefined : `/offer.html#${signToken('offer', message.offerId)}` })), coordinatorId });
  });
  app.post('/api/staff/openings', async (req, res) => {
    const { requestId, service, stylist, startsAt, durationMinutes, demoFast = false, failFirstDelivery = false } = req.body ?? {};
    if (typeof demoFast !== 'boolean' || typeof failFirstDelivery !== 'boolean' || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId) || service !== 'Haircut' || !['Elena', 'Theo'].includes(stylist) || !Number.isFinite(startsAt) || Math.abs(startsAt) > 8.64e15 || ![30, 45, 60].includes(durationMinutes)) { res.status(400).json({ error: 'Please supply a valid haircut, stylist, time, duration, and request ID.' }); return; }
    const date = (time: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
    if (date(startsAt) !== date(Date.now())) { res.status(400).json({ error: 'This prototype supports same-day appointments in the salon’s Los Angeles timezone.' }); return; }
    const result = await command({ type: 'create', opening: { id: `${coordinatorId}/opening/${requestId}`, service, stylist, startsAt, durationMinutes, demoFast, failFirstDelivery } });
    res.status(result.ok ? 201 : 409).json(result);
  });
  app.post('/api/staff/cancel', async (req, res) => {
    const { openingId, reason } = req.body ?? {};
    if (typeof openingId !== 'string' || !openingId.startsWith(coordinatorId + '/opening/') || typeof reason !== 'string' || !reason.trim() || reason.length > 200) {
      res.status(400).json({ error: 'Choose an opening and give a brief cancellation reason.' }); return;
    }
    const result = await command({ type: 'cancel', openingId, reason: reason.trim() });
    res.status(result.ok ? 200 : 409).json(result);
  });
  app.get('/api/offers/:token', async (req, res) => {
    const id = readToken(req.params.token, 'offer');
    const state = id ? await snapshot() : undefined;
    const offer = id && state ? state.offers[id] : undefined;
    if (!offer || !state) { res.status(404).json({ error: 'This opening is no longer available. Please contact the salon.' }); return; }
    const opening = state.openings[offer.openingId];
    res.json({ status: offer.status === 'active' && Date.now() >= offer.expiresAt ? 'expired' : offer.status, service: opening.service, stylist: opening.stylist, startsAt: opening.startsAt, durationMinutes: opening.durationMinutes, expiresAt: offer.expiresAt });
  });
  app.post('/api/offers/:token/respond', async (req, res) => {
    const id = readToken(req.params.token, 'offer');
    if (!id || !['accept', 'decline'].includes(req.body?.response)) { res.status(400).json({ error: 'A valid offer and response are required.' }); return; }
    const result = await command({ type: req.body.response, offerId: id });
    // Never return the coordinator result: it includes staff-only history.
    res.status(result.ok ? 200 : 409).json(result.ok ? { ok: true, status: result.offer?.status } : { ok: false, error: result.reason });
  });
  app.use(express.static(path.join(process.cwd(), 'public'), { setHeaders(res) { res.setHeader('Referrer-Policy', 'no-referrer'); } }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(503).json({ error: 'We could not verify the result yet. Refresh to check the status, then retry the same action if needed.' });
  });
  return app;
}
async function run() {
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const client = new Client({ connection });
  const coordinatorId = process.env.SALON_WORKFLOW_ID ?? 'salon/juniper-v2';
  try { await client.workflow.start('salonWorkflowV2', { workflowId: coordinatorId, taskQueue: process.env.TASK_QUEUE ?? 'juniper-salon-v2', args: [seedEntries(Date.now())], workflowIdReusePolicy: 'REJECT_DUPLICATE' }); }
  catch (error) { if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error; }
  createApp(client, coordinatorId).listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log('Juniper Salon: http://localhost:' + (process.env.PORT ?? 3000)));
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
