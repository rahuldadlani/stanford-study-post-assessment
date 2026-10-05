import { api, dateTime } from './api.js';
const token = location.hash.slice(1);
const $ = id => document.getElementById(id);
let submitting = false;
async function refresh() {
  try {
    const offer = await api(`/api/offers/${encodeURIComponent(token || 'missing')}`);
    $('details').textContent = `${offer.service} with ${offer.stylist} · ${dateTime(offer.startsAt)} · ${offer.durationMinutes} minutes`;
    $('accept').hidden = $('decline').hidden = offer.status !== 'active';
    const titles = { accepted: 'You’re booked. See you soon.', active: 'An earlier appointment, just for you.', declined: 'Thanks for letting us know.', canceled: 'This appointment is no longer available.' };
    $('title').textContent = titles[offer.status] ?? 'This opening is no longer available.';
    $('deadline').textContent = offer.status === 'active' ? `Please reply by ${dateTime(offer.expiresAt)} (${Math.max(0, Math.ceil((offer.expiresAt - Date.now()) / 1000))} seconds remaining).` : offer.status === 'accepted' ? 'Your appointment is confirmed. There’s nothing more to do.' : offer.status === 'declined' ? 'You declined this invitation. We’ll contact you if another suitable opening becomes available.' : 'Please contact the salon for help finding another appointment.';
  } catch (error) { $('accept').hidden = $('decline').hidden = true; $('title').textContent = 'Let’s check your invitation'; $('feedback').textContent = error.message; }
}
async function respond(response) {
  if (submitting) return;
  submitting = true; $('accept').disabled = $('decline').disabled = true;
  try { await api(`/api/offers/${encodeURIComponent(token)}/respond`, { method: 'POST', body: JSON.stringify({ response }) }); $('feedback').textContent = ''; }
  catch (error) { $('feedback').textContent = error.message; }
  finally { await refresh(); submitting = false; $('accept').disabled = $('decline').disabled = false; }
}
$('accept').onclick = () => respond('accept');
$('decline').onclick = () => respond('decline');
await refresh(); setInterval(() => { if (!submitting) refresh(); }, 2000);
