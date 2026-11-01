import { sb, q, personName } from '../sb.js';
import { esc, icon, ring, hm, ago, toast } from '../ui.js';

const DRINKS = [['koffie', 'Koffie'], ['thee', 'Thee'], ['cappuccino', 'Cappuccino'], ['water', 'Water']];
const STEPS = [['nieuw', 'Verstuurd'], ['geaccepteerd', 'Opgepakt'], ['onderweg', 'Onderweg'], ['gebracht', 'Gebracht']];
let form = null;

export async function render(el, ctx) {
  const me = ctx.me;
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();

  const [rooms, myBooking, requests, myLast] = await Promise.all([
    q(sb.from('rooms').select('id, name, capacity').eq('active', true).order('sort')),
    q(sb.from('bookings').select('room_id, title, ends_at').eq('user_id', me.id).lte('starts_at', new Date(Date.now() + 15 * 60000).toISOString()).gte('ends_at', nowIso).limit(1)),
    q(sb.from('coffee_requests').select('*').gte('created_at', since).in('status', ['nieuw', 'geaccepteerd', 'onderweg', 'gebracht']).order('created_at', { ascending: false })),
    q(sb.from('coffee_requests').select('items').eq('requester', me.id).order('created_at', { ascending: false }).limit(1))
  ]);
  const roomName = Object.fromEntries(rooms.map(r => [r.id, r.name]));
  const current = myBooking[0];
  if (!form) form = { room: current?.room_id || rooms[0]?.id, items: { koffie: 0, thee: 0, cappuccino: 0, water: 0 }, note: '' };

  const mine = requests.filter(r => r.requester === me.id && r.status !== 'gebracht');
  const recentlyDone = requests.filter(r => r.requester === me.id && r.status === 'gebracht' && Date.now() - new Date(r.updated_at) < 15 * 60000);
  const others = requests.filter(r => r.requester !== me.id && r.status !== 'gebracht');
  const total = Object.values(form.items).reduce((a, b) => a + b, 0);

  el.innerHTML = `
    ${[...mine, ...recentlyDone].map(r => statusCard(r, roomName, me.id)).join('')}

    ${others.length ? `
      <h2 class="section-title">Openstaande verzoeken</h2>
      ${others.map(r => otherCard(r, roomName, me.id)).join('')}` : ''}

    <h2 class="section-title">Nieuw verzoek</h2>
    ${current ? `<section class="section hero" style="margin-top:0">
      ${ring('right:-36px;top:-40px;width:120px;height:130px;border-width:16px;border-color:#0FA3B8;border-radius:32px')}
      <div class="eyebrow">Je zit nu in</div>
      <div class="display" style="font-size:28px;margin-top:4px">${esc(roomName[current.room_id] || '')}</div>
      <div class="small" style="opacity:.85">${esc(current.title)} · tot ${hm(current.ends_at)}</div>
    </section>` : ''}

    <section class="section">
      <div style="font-size:14px;font-weight:600;margin:0 4px 8px">${current ? 'Andere ruimte' : 'Welke ruimte?'}</div>
      <div class="chips">${rooms.map(r => `<button class="chip" data-act="room" data-id="${r.id}" aria-pressed="${form.room === r.id}">${esc(r.name)}</button>`).join('')}</div>
    </section>

    <section class="section card" style="padding-top:6px;padding-bottom:6px">
      ${myLast[0] ? `<button class="chip dashed" data-act="repeat" style="margin:10px 0 4px">${icon('redo', 16, '#0B7285')}Zelfde als vorige keer</button>` : ''}
      ${DRINKS.map(([k, label]) => `<div class="stepper"><span class="name">${label}</span>
        <button class="step" data-act="dec" data-k="${k}" ${form.items[k] ? '' : 'disabled'} aria-label="${label} minder">−</button>
        <span class="n">${form.items[k]}</span>
        <button class="step" data-act="inc" data-k="${k}" aria-label="${label} meer">+</button></div>`).join('')}
      <div style="padding:12px 0">
        <label class="field" for="note" style="margin-top:0">Opmerking (optioneel)</label>
        <textarea class="input" id="note" rows="2" placeholder="Bijv. 1× zonder suiker, graag melk erbij">${esc(form.note)}</textarea>
      </div>
    </section>

    <div class="section" style="margin-bottom:10px">
      <button class="btn primary block" data-act="send" ${total ? '' : 'disabled'} style="min-height:54px;font-size:17px">Verstuur · ${total} drankje${total === 1 ? '' : 's'}</button>
      <p class="small muted" style="text-align:center;margin-top:8px">Iedereen op kantoor ziet het verzoek. Wie het oppakt, brengt het.</p>
    </div>
  `;

  el.querySelector('#note').addEventListener('input', (e) => { form.note = e.target.value; });
  const rerender = () => render(el, ctx);

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === 'room') { form.room = Number(b.dataset.id); rerender(); }
      if (act === 'inc' || act === 'dec') { form.items[b.dataset.k] = Math.max(0, form.items[b.dataset.k] + (act === 'inc' ? 1 : -1)); rerender(); }
      if (act === 'repeat') { form.items = { koffie: 0, thee: 0, cappuccino: 0, water: 0, ...myLast[0].items }; rerender(); }
      if (act === 'send') {
        b.disabled = true;
        const items = Object.fromEntries(Object.entries(form.items).filter(([, v]) => v > 0));
        await q(sb.from('coffee_requests').insert({ room_id: form.room, items, note: form.note.trim() }));
        form = null; toast('Verzoek verstuurd'); rerender();
      }
      if (act === 'advance') {
        await q(sb.rpc('coffee_advance', { req: Number(b.dataset.id), new_status: b.dataset.to }));
        rerender();
      }
    } catch (err) { toast(err.message, true); rerender(); }
  };
}

function summary(items) {
  return DRINKS.filter(([k]) => items?.[k] > 0).map(([k, l]) => `${items[k]}× ${l.toLowerCase()}`).join(', ');
}

function statusCard(r, roomName, myId) {
  const idx = STEPS.findIndex(s => s[0] === r.status);
  const heads = ['Verzoek is verstuurd', `${personName(r.handler).split(' ')[0]} pakt het op`, 'Onderweg!', 'Geniet ervan!'];
  return `<section class="section hero teal" style="margin-top:16px">
    ${ring('right:-30px;top:-36px;width:120px;height:130px;border-width:16px;border-color:#0B2E4F;border-radius:32px')}
    <div class="eyebrow">${esc(roomName[r.room_id] || '')} · ${hm(r.created_at)}</div>
    <div class="display" style="font-size:32px;line-height:1.05;margin-top:6px;max-width:240px">${esc(heads[idx])}</div>
    <div style="font-size:15px;margin-top:4px">${esc(summary(r.items))}</div>
  </section>
  <section class="section card">
    <ol class="status-steps">
      ${STEPS.map(([k, label], i) => `<li class="${i <= idx ? 'done' : ''}">
        <div style="display:flex;flex-direction:column;align-items:center"><span class="dot"></span><span class="line"></span></div>
        <div style="padding-bottom:14px"><div style="font-size:16px;font-weight:${i === idx ? 700 : 500};color:${i <= idx ? '#0B2E4F' : '#5B6B7C'}">${label}</div>
        ${i === 1 && r.handler ? `<div class="small muted">door ${esc(personName(r.handler))}</div>` : ''}</div></li>`).join('')}
    </ol>
    ${r.status === 'nieuw' ? `<button class="btn ghost sm" data-act="advance" data-id="${r.id}" data-to="geannuleerd">Annuleren</button>` : ''}
  </section>`;
}

function otherCard(r, roomName, myId) {
  const handling = r.handler === myId;
  let action = '';
  if (r.status === 'nieuw') action = `<button class="btn primary sm" data-act="advance" data-id="${r.id}" data-to="geaccepteerd">Ik pak het op</button>`;
  else if (handling && r.status === 'geaccepteerd') action = `<button class="btn navy sm" data-act="advance" data-id="${r.id}" data-to="onderweg">Onderweg</button>`;
  else if (handling && r.status === 'onderweg') action = `<button class="btn navy sm" data-act="advance" data-id="${r.id}" data-to="gebracht">Gebracht</button>`;
  else action = `<span class="badge teal">${esc(personName(r.handler).split(' ')[0])} is bezig</span>`;
  return `<section class="section card" style="margin-top:0;margin-bottom:10px;${r.status === 'nieuw' ? 'border:2px solid #E5482D' : ''}">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><div class="eyebrow" style="color:#0B7285">${esc(roomName[r.room_id] || '')} · ${ago(r.created_at)}</div>
      <div style="font-size:17px;font-weight:700;margin-top:4px">${esc(summary(r.items))}</div>
      <div class="small muted">voor ${esc(personName(r.requester))}${r.note ? ` · “${esc(r.note)}”` : ''}</div></div>
    </div>
    <div style="margin-top:12px">${action}</div>
  </section>`;
}
