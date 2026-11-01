import { sb, q, personName, loadPeople } from '../sb.js';
import { esc, icon, ring, ymd, isoDow, workday, longDate, cap, toast, sheet, avatar } from '../ui.js';
import { getSettings } from './shared.js';

let draft = null; // { day, joins, items }

export async function render(el, ctx) {
  const me = ctx.me;
  const settings = await getSettings();
  const deadline = settings.lunch_deadline || '11:30';
  const snackDow = Number(settings.snack_day || 5);
  const rouletteTime = settings.roulette_time || '10:30';

  const dayDate = workday(new Date());
  const day = ymd(dayDate);
  const isToday = day === ymd();
  const [dh, dm] = deadline.split(':').map(Number);
  const close = new Date(dayDate); close.setHours(dh, dm, 0, 0);
  const open = Date.now() < close.getTime();
  const snackDay = isoDow(dayDate) === snackDow;

  const [snacks, orders, myLast, duties, shopping, people] = await Promise.all([
    q(sb.from('snacks').select('id, name').eq('active', true).order('sort')),
    q(sb.from('lunch_orders').select('user_id, joins, items').eq('day', day)),
    q(sb.from('lunch_orders').select('items, day').eq('user_id', me.id).lt('day', day).order('day', { ascending: false }).limit(10)),
    isToday ? Promise.all(['tafel', 'airfryer'].map(k => q(sb.rpc('assign_duty', { d: day, k })))) : Promise.resolve([null, null]),
    q(sb.from('shopping_items').select('*').or(`status.neq.gekocht,bought_at.gt.${new Date(Date.now() - 86400000).toISOString()}`).order('created_at', { ascending: false })),
    loadPeople()
  ]);

  const mine = orders.find(o => o.user_id === me.id);
  if (!draft || draft.day !== day) draft = { day, joins: mine ? mine.joins : true, items: { ...(mine?.items || {}) }, saved: !!mine };
  const lastSnackOrder = myLast.find(o => Object.values(o.items || {}).some(v => v > 0));

  // Totalen kantoor
  const joiners = orders.filter(o => o.joins);
  const totals = {};
  joiners.forEach(o => Object.entries(o.items || {}).forEach(([k, v]) => { totals[k] = (totals[k] || 0) + Number(v); }));
  const snackName = Object.fromEntries(snacks.map(s => [String(s.id), s.name]));
  const totalsText = Object.entries(totals).filter(([, v]) => v > 0).map(([k, v]) => `${v}× ${(snackName[k] || '?').toLowerCase()}`).join(', ');

  const [tafel, airfryer] = duties;
  const left = Math.max(0, close.getTime() - Date.now());
  const hLeft = Math.floor(left / 3600000), mLeft = Math.floor((left % 3600000) / 60000);

  const summary = !draft.joins ? 'Je luncht niet mee'
    : (snacks.filter(s => draft.items[s.id] > 0).map(s => `${draft.items[s.id]}× ${s.name.toLowerCase()}`).join(', ') || (snackDay ? 'Alleen lunch, geen snacks' : 'Je luncht mee'));

  el.classList.add('has-sticky');
  el.innerHTML = `
    <section class="page-head"><h1>Lunch</h1></section>

    <section class="section hero ${snackDay ? 'orange' : ''}">
      ${ring(`right:-40px;top:-30px;width:130px;height:150px;border-width:18px;border-color:${snackDay ? '#0B2E4F' : '#E5482D'};border-radius:36px`)}
      <div class="eyebrow">${snackDay ? 'Airfryer-' + esc(longDate(dayDate).split(' ')[0]) : 'Gezamenlijke lunch'} · ${esc(longDate(dayDate).split(' ').slice(1).join(' '))}</div>
      ${open
        ? `<div class="big">${hLeft ? `${hLeft} u ` : ''}${mLeft} min</div><div style="font-size:15px;margin-top:2px">tot de bestelling sluit (${esc(deadline)})</div>`
        : `<div class="big">Gesloten</div><div style="font-size:15px;margin-top:2px">${joiners.length} collega's eten mee</div>`}
    </section>

    <section class="section card">
      <h2 style="margin-bottom:10px">Lunch jij mee${isToday ? '' : ' op ' + esc(longDate(dayDate).split(' ')[0])}?</h2>
      <div class="seg dark" role="group" aria-label="Deelname lunch">
        <button data-act="join" data-v="1" aria-pressed="${draft.joins}" ${open ? '' : 'disabled'}>Ja, ik eet mee</button>
        <button data-act="join" data-v="0" aria-pressed="${!draft.joins}" ${open ? '' : 'disabled'}>Nee, niet</button>
      </div>
    </section>

    ${snackDay && draft.joins ? `
    <section class="section card" style="padding-top:8px;padding-bottom:6px">
      <h2 style="padding:8px 0 4px">Wat wil je uit de airfryer?</h2>
      ${lastSnackOrder && open ? `<button class="chip dashed" data-act="repeat" style="margin:4px 0 6px">${icon('redo', 16, '#0B7285')}Zelfde als vorige keer</button>` : ''}
      ${snacks.map(s => {
        const n = Number(draft.items[s.id] || 0);
        return `<div class="stepper"><span class="name">${esc(s.name)}</span>
          <button class="step" data-act="dec" data-id="${s.id}" ${!open || n === 0 ? 'disabled' : ''} aria-label="${esc(s.name)} minder">−</button>
          <span class="n" aria-live="polite">${n}</span>
          <button class="step" data-act="inc" data-id="${s.id}" ${!open || n >= 5 ? 'disabled' : ''} aria-label="${esc(s.name)} meer">+</button></div>`;
      }).join('') || '<p class="empty">Nog geen snacks ingesteld.</p>'}
      <p class="small muted" style="padding:10px 0">${totalsText ? `Heel kantoor tot nu toe: ${esc(totalsText)}` : 'Nog niemand heeft snacks besteld.'}</p>
    </section>` : ''}

    ${isToday ? `
    <section class="section grid2">
      ${dutyCard('tafel', 'Tafel dekken', tafel, me.id, rouletteTime)}
      ${snackDay ? dutyCard('airfryer', 'Airfryer', airfryer, me.id, rouletteTime) : `<div class="card"><div class="eyebrow muted">Mee-eters</div><div style="font-size:28px;font-weight:700;margin-top:6px">${joiners.length}</div><div class="small muted">vandaag</div></div>`}
    </section>` : ''}

    ${snackDay && isToday && (airfryer === me.id || me.is_admin) ? `
    <section class="section card">
      <h2>Bestellingen voor de airfryer</h2>
      <ul class="list" style="margin-top:6px">
        ${snacks.map(s => `<li><span style="flex:1;font-weight:600">${esc(s.name)}</span><strong>${totals[s.id] || 0}</strong></li>`).join('')}
      </ul>
      <details style="margin-top:8px"><summary class="small" style="min-height:44px;display:flex;align-items:center;cursor:pointer">Per persoon</summary>
        <ul class="list">${joiners.map(o => `<li>${avatar(o.user_id, personName(o.user_id))}<span style="flex:1">${esc(personName(o.user_id))}</span>
          <span class="small muted">${esc(Object.entries(o.items || {}).filter(([, v]) => v > 0).map(([k, v]) => `${v}× ${snackName[k] || '?'}`).join(', ') || 'geen snacks')}</span></li>`).join('')}</ul>
      </details>
    </section>` : ''}

    <section class="section card" id="boodschappen">
      <div class="row" style="justify-content:space-between">
        <h2 class="display" style="font-size:21px">Boodschappen</h2>
        <button class="btn soft sm" data-act="addshop" style="background:#FDECE8;color:#C93A1F">${icon('plus', 16, '#C93A1F')}Toevoegen</button>
      </div>
      <ul class="list" style="margin-top:6px">
        ${shopping.length ? shopping.map(it => `
          <li>
            <input type="checkbox" id="s${it.id}" data-act="buy" data-id="${it.id}" ${it.status === 'gekocht' ? 'checked' : ''} style="width:22px;height:22px;accent-color:#0B2E4F;margin:0">
            <label for="s${it.id}" style="flex:1;font-size:16px;${it.status === 'gekocht' ? 'color:#5B6B7C;text-decoration:line-through' : ''}">${esc(it.name)}</label>
            ${it.status === 'gekocht' ? `<span class="small muted">door ${esc(personName(it.bought_by).split(' ')[0])}</span>`
              : `<button class="badge ${it.status === 'op' ? 'red' : 'amber'}" data-act="cycle" data-id="${it.id}" data-v="${it.status}" style="border:0;min-height:32px">${it.status === 'op' ? 'Op' : 'Bijna op'}</button>`}
          </li>`).join('') : '<li class="empty">Alles is er nog. Top!</li>'}
      </ul>
    </section>

    <div class="sticky-bar">
      <div style="flex:1;min-width:0"><div class="small muted">Jouw bestelling</div>
        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(summary)}</div></div>
      <button class="btn ${draft.saved ? 'soft' : 'primary'}" data-act="save" ${open ? '' : 'disabled'} style="min-width:124px">${!open ? 'Gesloten' : draft.saved ? '✓ Opgeslagen' : 'Opslaan'}</button>
    </div>
  `;

  const rerender = () => render(el, ctx);

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    try {
      if (act === 'join') { draft.joins = b.dataset.v === '1'; draft.saved = false; rerender(); }
      if (act === 'inc' || act === 'dec') {
        draft.items[id] = Math.max(0, Math.min(5, Number(draft.items[id] || 0) + (act === 'inc' ? 1 : -1)));
        draft.saved = false; rerender();
      }
      if (act === 'repeat') { draft.items = { ...lastSnackOrder.items }; draft.saved = false; rerender(); }
      if (act === 'save') {
        const items = Object.fromEntries(Object.entries(draft.items).filter(([, v]) => v > 0));
        await q(sb.from('lunch_orders').upsert({ user_id: me.id, day, joins: draft.joins, items: draft.joins ? items : {}, updated_at: new Date().toISOString() }));
        draft.saved = true; toast('Bestelling opgeslagen'); rerender();
      }
      if (act === 'done') {
        await q(sb.from('duties').update({ done: true }).eq('day', day).eq('kind', b.dataset.kind));
        toast('Top, bedankt!'); rerender();
      }
      if (act === 'swap') swapSheet(b.dataset.kind, day, me, rerender);
      if (act === 'buy') {
        const bought = b.checked;
        await q(sb.from('shopping_items').update(bought ? { status: 'gekocht', bought_by: me.id, bought_at: new Date().toISOString() } : { status: 'op', bought_by: null, bought_at: null }).eq('id', id));
        rerender();
      }
      if (act === 'cycle') {
        await q(sb.from('shopping_items').update({ status: b.dataset.v === 'op' ? 'bijna' : 'op' }).eq('id', id));
        rerender();
      }
      if (act === 'addshop') {
        sheet(`<form><h2>Op de boodschappenlijst</h2>
          <label class="field" for="nm">Product</label><input class="input" id="nm" name="name" required placeholder="Bijv. melk">
          <label class="field" for="st">Hoe dringend?</label>
          <select class="input" id="st" name="status"><option value="op">Helemaal op</option><option value="bijna">Bijna op</option></select>
          <button class="btn primary block" type="submit" style="margin-top:16px">Toevoegen</button>
          <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`,
          async (fd) => { await q(sb.from('shopping_items').insert({ name: fd.get('name').trim(), status: fd.get('status') })); rerender(); });
      }
    } catch (err) { toast(err.message, true); }
  };
}

function dutyCard(kind, label, uid, myId, rouletteTime) {
  const mineDuty = uid === myId;
  if (!uid) return `<div class="card"><div class="eyebrow muted">${label}</div><div style="font-size:16px;font-weight:700;margin-top:6px">Om ${esc(rouletteTime)} geloot</div><div class="small muted">onder wie op kantoor is</div></div>`;
  return `<div class="card" style="${mineDuty ? 'border:2px solid #E5482D' : ''}">
    <div class="eyebrow" style="color:${mineDuty ? '#C93A1F' : '#0B7285'}">${label}</div>
    <div style="font-size:17px;font-weight:700;margin-top:6px">${mineDuty ? 'Jij, vandaag' : esc(personName(uid))}</div>
    ${mineDuty ? `<div class="row" style="gap:0;margin-left:-6px">
      <button class="linkbtn" data-act="done" data-kind="${kind}">Gedaan</button>
      <button class="linkbtn" data-act="swap" data-kind="${kind}">Ruilen</button></div>` : ''}
  </div>`;
}

async function swapSheet(kind, day, me, done) {
  const people = await loadPeople();
  const present = await q(sb.from('presence').select('user_id').eq('day', day).eq('status', 'kantoor'));
  const ids = present.map(p => p.user_id).filter(id => id !== me.id && people[id]?.active);
  sheet(`<form><h2>Taak overdragen</h2>
    <p class="muted">Kies een collega die vandaag op kantoor is. Spreek het wel even af!</p>
    <label class="field" for="who">Collega</label>
    <select class="input" id="who" name="who" required>
      ${ids.length ? ids.map(id => `<option value="${id}">${esc(people[id].full_name)}</option>`).join('') : '<option value="">Nog niemand ingecheckt</option>'}
    </select>
    <button class="btn primary block" type="submit" style="margin-top:16px" ${ids.length ? '' : 'disabled'}>Overdragen</button>
    <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`,
    async (fd) => {
      await q(sb.from('duties').update({ user_id: fd.get('who') }).eq('day', day).eq('kind', kind));
      toast('Taak overgedragen'); done();
    });
}
