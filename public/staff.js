import { api, dateTime, element } from './api.js';
const $ = id => document.getElementById(id);
let signedIn = false;
let requestId = crypto.randomUUID();
const time = new Date(Date.now() + 5 * 60_000); time.setMinutes(time.getMinutes() - time.getTimezoneOffset());
document.querySelector('[name=startsAt]').value = time.toISOString().slice(0, 16);
function render(state) {
  $('openings').replaceChildren();
  const entries = new Map(state.entries.map(entry => [entry.id, entry]));
  for (const opening of Object.values(state.openings).reverse()) {
    const card = element('div', '', 'card');
    card.append(element('strong', `${opening.service} with ${opening.stylist} · ${dateTime(opening.startsAt)}`), element('p', ({pending:'Finding a client',offering:'Waiting for a reply',filled:'Booked — update your calendar',unfilled:'Unfilled',canceled:'Canceled'})[opening.status], 'badge'));
    for (const event of opening.history) card.append(element('p', `${new Date(event.at).toLocaleTimeString()} · ${event.message}`));
    const offer = state.offers[opening.offerId];
    if (offer?.status === 'active') card.append(element('p', `Reply by ${dateTime(offer.expiresAt)}`, 'muted'));
    if (!['canceled', 'unfilled'].includes(opening.status)) {
      const cancel = element('button', opening.status === 'filled' ? 'Cancel booking' : 'Stop outreach', 'secondary');
      cancel.onclick = async () => {
        const reason = prompt('Why is this opening no longer available?', 'Stylist unavailable');
        if (!reason?.trim()) return;
        cancel.disabled = true;
        try { await api('/api/staff/cancel', { method: 'POST', body: JSON.stringify({ openingId: opening.id, reason }) }); $('feedback').textContent = 'Canceled. The client link now shows the updated status.'; await refresh(); }
        catch (error) { $('feedback').textContent = error.message; cancel.disabled = false; }
      };
      card.append(cancel);
    }
    $('openings').append(card);
  }
  if (!Object.keys(state.openings).length) $('openings').append(element('p', 'Your next opening can become someone’s earlier appointment.'));
  $('messages').replaceChildren();
  for (const message of [...state.messages].reverse()) {
    const card = element('div', '', 'card');
    card.append(element('strong', `SIMULATED ${message.kind.toUpperCase()} · ${entries.get(message.entryId).name} · ${message.delivery === 'failed' ? 'NOT DELIVERED' : message.delivery === 'superseded' ? 'SUPERSEDED' : 'DELIVERED'}`), element('p', message.text));
    if (message.url) { const link = element('a', 'Open private client link', 'link'); link.href = message.url; link.target = '_blank'; link.rel = 'noopener'; card.append(link); } $('messages').append(card);
  }
  $('waitlist').replaceChildren(...state.entries.map(entry => element('p', `${entry.name} · ${entry.service} · ${entry.fulfilled ? 'Booked' : 'Waiting'} · joined ${dateTime(entry.joinedAt)}`)));
}
async function refresh() {
  try { const state = await api('/api/staff/state'); signedIn = true; $('signin').hidden = true; $('dashboard').hidden = false; render(state); }
  catch (error) { if (error.status === 401) { signedIn = false; $('signin').hidden = false; $('dashboard').hidden = true; } else $('feedback').textContent = error.message; }
}
$('login').onsubmit = async event => { event.preventDefault(); try { await api('/api/staff/session', { method: 'POST', body: JSON.stringify({ password: new FormData(event.target).get('password') }) }); $('feedback').textContent = ''; await refresh(); } catch (error) { $('feedback').textContent = error.message; } };
$('logout').onclick = async () => { await api('/api/staff/session', { method: 'DELETE' }); await refresh(); };
$('opening').addEventListener('input', () => { requestId = crypto.randomUUID(); });
$('opening').onsubmit = async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  const values = Object.fromEntries(new FormData(event.target));
  try { await api('/api/staff/openings', { method: 'POST', body: JSON.stringify({ ...values, demoFast: values.demoFast === 'on', failFirstDelivery: values.failFirstDelivery === 'on', requestId, startsAt: new Date(values.startsAt).getTime(), durationMinutes: Number(values.durationMinutes) }) }); requestId = crypto.randomUUID(); $('feedback').textContent = 'Opening added. We’re finding a suitable client.'; await refresh(); }
  catch (error) { $('feedback').textContent = error.message; } finally { button.disabled = false; }
};
await refresh(); setInterval(() => { if (signedIn) refresh(); }, 2000);
