import { sb, q, personName } from '../sb.js';
import { esc, icon, ring, ymd, hm, isoDow, addDays, fromYmd, longDate, shortDate, cap, toast, sheet } from '../ui.js';
import { pollCard } from './home.js';

let view = 'rooms';
let selDay = null;
const START_H = 8, END_H = 18;

export async function render(el, ctx) {
  el.innerHTML = `
    <section class="page-head">
      <h1 style="margin-bottom:14px">Agenda</h1>
      <div class="seg" role="tablist" aria-label="Agenda-onderdeel">
        <button role="tab" data-act="view" data-v="rooms" aria-selected="${view === 'rooms'}">Ruimtes</button>
        <button role="tab" data-act="view" data-v="acts" aria-selected="${view === 'acts'}">Activiteiten</button>
      </div>
    </section>
    <div id="sub"><div class="loading">Laden…</div></div>`;
  const sub = el.querySelector('#sub');
  el.onclick = (e) => {
    const b = e.target.closest('[data-act="view"]');
    if (b) { view = b.dataset.v; render(el, ctx); }
  };
  if (view === 'rooms') await rooms(sub, ctx); else await activities(sub, ctx);
}

// ------------------------------------------------------------------
//  Ruimtes
// ------------------------------------------------------------------
async function rooms(el, ctx) {
  const me = ctx.me;
  const today = new Date();
  let monday = addDays(today, 1 - isoDow(today));
  if (isoDow(today) > 5) monday = addDays(monday, 7);
  const days = [0, 1, 2, 3, 4].map(i => addDays(monday, i));
  if (!selDay || !days.some(d => ymd(d) === selDay)) selDay = ymd(isoDow(today) <= 5 ? today : monday);
  const d0 = fromYmd(selDay), d1 = addDays(d0, 1);

  const [roomList, bookings] = await Promise.all([
    q(sb.from('rooms').select('*').eq('active', true).order('sort')),
    q(sb.from('bookings').select('*').gte('ends_at', d0.toISOString()).lt('starts_at', d1.toISOString()).order('starts_at'))
  ]);

  const now = new Date();
  const isToday = selDay === ymd(now);
  const busyNow = (rid) => bookings.find(b => b.room_id === rid && new Date(b.starts_at) <= now && new Date(b.ends_at) > now);
  const nextStart = (rid) => bookings.find(b => b.room_id === rid && new Date(b.starts_at) > now);
  const free = isToday ? roomList.find(r => !busyNow(r.id)) : null;
  const freeUntil = free && nextStart(free.id) ? hm(nextStart(free.id).starts_at) : null;
  const pct = (t) => Math.max(0, Math.min(100, ((t.getHours() + t.getMinutes() / 60) - START_H) / (END_H - START_H) * 100));

  el.innerHTML = `
    <section class="section">
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px">
        ${days.map(d => {
          const on = ymd(d) === selDay;
          return `<button data-act="day" data-v="${ymd(d)}" aria-pressed="${on}" style="min-height:58px;border-radius:14px;${on ? 'background:#0B2E4F;color:#fff;border:0' : 'background:#fff;color:#0B2E4F;border:1.5px solid #E3E8EE'}">
            <span style="display:block;font-size:12px;font-weight:600">${['ma', 'di', 'wo', 'do', 'vr'][isoDow(d) - 1]}</span>
            <span style="display:block;font-size:20px;font-weight:700">${d.getDate()}</span></button>`;
        }).join('')}
      </div>
    </section>

    ${free ? `<section class="section hero">
      ${ring('right:-40px;top:-44px;width:130px;height:140px;border-width:18px;border-color:#0FA3B8;border-radius:34px')}
      <div class="eyebrow">Nu vrij</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px">${esc(free.name)}</div>
      <div class="small" style="opacity:.85;margin-bottom:14px">${freeUntil ? `tot ${freeUntil}` : 'de rest van de dag'} · ${free.capacity} personen</div>
      <div class="row" style="gap:8px">
        <button class="btn primary sm" data-act="quick" data-room="${free.id}">Boek nu 30 min</button>
        <button class="btn sm" data-act="book" data-room="${free.id}" style="background:transparent;color:#fff;border:2px solid rgba(255,255,255,.6)">Ander tijdstip</button>
      </div>
    </section>` : ''}

    <div class="section-title">${esc(cap(longDate(d0)))}
      <button class="btn primary sm" data-act="book">${icon('plus', 16, '#fff')}Reserveren</button></div>

    ${roomList.map(r => {
      const list = bookings.filter(b => b.room_id === r.id);
      return `<section class="section card" style="margin-top:0;margin-bottom:10px">
        <div class="row" style="justify-content:space-between;align-items:baseline">
          <h3 style="font-size:17px">${esc(r.name)}</h3>
          <span class="small muted">${r.capacity} pers.${r.features ? ' · ' + esc(r.features) : ''}</span>
        </div>
        <div class="hours"><span>08</span><span>10</span><span>12</span><span>14</span><span>16</span><span>18</span></div>
        <div class="timeline">
          ${list.map(b => { const s = pct(new Date(b.starts_at)), e = pct(new Date(b.ends_at)); return `<div class="busy ${b.user_id === me.id ? 'mine' : ''}" style="left:${s}%;width:${Math.max(1.5, e - s)}%"></div>`; }).join('')}
          ${isToday ? `<div class="now" style="left:${pct(now)}%"></div>` : ''}
        </div>
        <ul class="list" style="margin-top:8px">
          ${list.length ? list.map(b => `<li style="min-height:44px">
            <span style="flex:1;font-size:14px"><strong>${hm(b.starts_at)}–${hm(b.ends_at)}</strong> ${esc(b.title)} · ${esc(personName(b.user_id).split(' ')[0])}</span>
            ${b.user_id === me.id || me.is_admin ? `<button class="iconbtn" data-act="cancel" data-id="${b.id}" aria-label="Reservering annuleren">${icon('trash', 18, '#5B6B7C')}</button>` : ''}
          </li>`).join('') : `<li class="empty" style="min-height:0">Hele dag vrij</li>`}
        </ul>
      </section>`;
    }).join('')}
  `;

  const rerender = () => rooms(el, ctx);
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      if (b.dataset.act === 'day') { selDay = b.dataset.v; rerender(); }
      if (b.dataset.act === 'quick') {
        const s = new Date(); s.setSeconds(0, 0); s.setMinutes(Math.floor(s.getMinutes() / 5) * 5);
        await q(sb.from('bookings').insert({ room_id: Number(b.dataset.room), title: 'Kort overleg', starts_at: s.toISOString(), ends_at: new Date(s.getTime() + 30 * 60000).toISOString() }));
        toast('Geboekt tot ' + hm(new Date(s.getTime() + 30 * 60000))); rerender();
      }
      if (b.dataset.act === 'book') bookSheet(roomList, b.dataset.room, rerender);
      if (b.dataset.act === 'cancel') {
        if (!confirm('Deze reservering annuleren?')) return;
        await q(sb.from('bookings').delete().eq('id', b.dataset.id));
        toast('Reservering geannuleerd'); rerender();
      }
    } catch (err) { toast(err.message, true); }
  };
}

function bookSheet(roomList, roomId, done) {
  const now = new Date();
  const m = Math.ceil(now.getMinutes() / 15) * 15;
  const startDefault = `${String(now.getHours() + (m === 60 ? 1 : 0)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  sheet(`<form><h2>Ruimte reserveren</h2>
    <label class="field" for="rm">Ruimte</label>
    <select class="input" id="rm" name="room">${roomList.map(r => `<option value="${r.id}" ${String(r.id) === String(roomId) ? 'selected' : ''}>${esc(r.name)} (${r.capacity} pers.)</option>`).join('')}</select>
    <label class="field" for="tt">Waarvoor?</label>
    <input class="input" id="tt" name="title" required placeholder="Bijv. bouwteam, klantoverleg">
    <div class="grid2">
      <div><label class="field" for="dd">Datum</label><input class="input" type="date" id="dd" name="date" required value="${selDay}"></div>
      <div><label class="field" for="st">Begintijd</label><input class="input" type="time" id="st" name="start" required step="900" value="${startDefault}"></div>
    </div>
    <label class="field" for="du">Duur</label>
    <select class="input" id="du" name="dur"><option value="30">30 minuten</option><option value="60" selected>1 uur</option><option value="90">1,5 uur</option><option value="120">2 uur</option><option value="180">3 uur</option><option value="240">4 uur</option></select>
    <button class="btn primary block" type="submit" style="margin-top:16px">Reserveren</button>
    <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`,
    async (fd) => {
      const [y, mo, d] = fd.get('date').split('-').map(Number);
      const [h, mi] = fd.get('start').split(':').map(Number);
      const s = new Date(y, mo - 1, d, h, mi);
      const e = new Date(s.getTime() + Number(fd.get('dur')) * 60000);
      await q(sb.from('bookings').insert({ room_id: Number(fd.get('room')), title: fd.get('title').trim(), starts_at: s.toISOString(), ends_at: e.toISOString() }));
      toast('Gereserveerd'); selDay = fd.get('date'); done();
    });
}

// ------------------------------------------------------------------
//  Activiteiten, polls en verjaardagen
// ------------------------------------------------------------------
async function activities(el, ctx) {
  const me = ctx.me;
  const nowIso = new Date().toISOString();
  const [acts, polls, bdays] = await Promise.all([
    q(sb.from('activities').select('*, rsvps(user_id, answer)').gte('starts_at', new Date(Date.now() - 3 * 3600000).toISOString()).order('starts_at').limit(20)),
    q(sb.from('polls').select('id, question, closes_at, created_by, poll_options(id, label, sort), poll_votes(user_id, option_id)').or(`closes_at.is.null,closes_at.gt.${nowIso}`).order('created_at', { ascending: false })),
    q(sb.rpc('upcoming_birthdays', { days: 30 }))
  ]);

  el.innerHTML = `
    ${acts.map((a, i) => {
      const my = a.rsvps.find(r => r.user_id === me.id)?.answer;
      const going = a.rsvps.filter(r => r.answer === 'ja');
      const first = i === 0;
      return `<section class="section ${first ? 'hero orange' : 'card'}" ${first ? '' : 'style="margin-top:10px"'}>
        ${first ? ring('right:-36px;top:-40px;width:120px;height:140px;border-width:18px;border-color:#0B2E4F;border-radius:34px') : ''}
        <div class="eyebrow" ${first ? '' : 'style="color:#0B7285"'}>${esc(cap(shortDate(a.starts_at)))} · ${hm(a.starts_at)}${a.location ? ' · ' + esc(a.location) : ''}</div>
        <h3 class="${first ? 'display' : ''}" style="font-size:${first ? 28 : 18}px;margin:6px 0 2px">${esc(a.title)}</h3>
        ${a.description ? `<p style="font-size:14px;${first ? '' : 'color:#5B6B7C'}">${esc(a.description)}</p>` : ''}
        <p class="small" style="margin:6px 0 12px;${first ? '' : 'color:#5B6B7C'}">${going.length} ${going.length === 1 ? 'komt' : 'komen'}${going.length ? ': ' + esc(going.slice(0, 6).map(r => personName(r.user_id).split(' ')[0]).join(', ')) + (going.length > 6 ? '…' : '') : ''}</p>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
          ${[['ja', 'Ja'], ['misschien', 'Misschien'], ['nee', 'Nee']].map(([v, l]) => {
            const on = my === v;
            const style = first ? `border:2px solid #fff;${on ? 'background:#fff;color:#0B2E4F' : 'background:transparent;color:#fff'}` : `border:2px solid #0B2E4F;${on ? 'background:#0B2E4F;color:#fff' : 'background:#fff;color:#0B2E4F'}`;
            return `<button data-act="rsvp" data-id="${a.id}" data-v="${v}" aria-pressed="${on}" style="min-height:44px;border-radius:12px;font-weight:700;font-size:14px;${style}">${l}</button>`;
          }).join('')}
        </div>
        ${a.created_by === me.id || me.is_admin ? `<button class="linkbtn" data-act="delact" data-id="${a.id}" style="margin-top:6px;${first ? 'color:#fff' : ''}">Verwijderen</button>` : ''}
      </section>`;
    }).join('') || `<section class="section card"><p class="empty">Nog geen activiteiten gepland. Organiseer jij iets?</p></section>`}

    ${polls.map(p => pollCard(p, me.id) + (p.created_by === me.id || me.is_admin ? `<div class="section" style="margin-top:0"><button class="linkbtn" data-act="delpoll" data-id="${p.id}">Poll verwijderen</button></div>` : '')).join('')}

    ${bdays.length ? `<h2 class="section-title">Verjaardagen</h2>
    <section class="section card" style="margin-top:0;padding-top:4px;padding-bottom:4px">
      <ul class="list">${bdays.map(b => `<li>
        <div style="width:44px;text-align:center"><div class="small" style="font-weight:700;color:#C93A1F">${['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'][isoDow(fromYmd(b.birthday)) - 1]}</div>
        <div style="font-size:20px;font-weight:700">${fromYmd(b.birthday).getDate()}</div></div>
        <div><div style="font-weight:700">${esc(b.full_name)}</div><div class="small muted">${esc(longDate(fromYmd(b.birthday)))}</div></div></li>`).join('')}</ul>
    </section>` : ''}

    <div class="section grid2" style="margin-top:16px">
      <button class="btn ghost" data-act="newact" style="border-style:dashed">+ Activiteit</button>
      <button class="btn ghost" data-act="newpoll" style="border-style:dashed">+ Poll / datumprikker</button>
    </div>
  `;

  const rerender = () => activities(el, ctx);
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      const act = b.dataset.act;
      if (act === 'rsvp') {
        if (b.getAttribute('aria-pressed') === 'true') await q(sb.from('rsvps').delete().eq('activity_id', b.dataset.id).eq('user_id', me.id));
        else await q(sb.from('rsvps').upsert({ activity_id: Number(b.dataset.id), user_id: me.id, answer: b.dataset.v }));
        rerender();
      }
      if (act === 'vote') {
        const pid = Number(b.dataset.poll);
        if (b.getAttribute('aria-pressed') === 'true') await q(sb.from('poll_votes').delete().eq('poll_id', pid).eq('user_id', me.id));
        else await q(sb.from('poll_votes').upsert({ poll_id: pid, user_id: me.id, option_id: Number(b.dataset.opt) }));
        rerender();
      }
      if (act === 'delact' && confirm('Activiteit verwijderen?')) { await q(sb.from('activities').delete().eq('id', b.dataset.id)); rerender(); }
      if (act === 'delpoll' && confirm('Poll verwijderen?')) { await q(sb.from('polls').delete().eq('id', b.dataset.id)); rerender(); }
      if (act === 'newact') {
        sheet(`<form><h2>Activiteit voorstellen</h2>
          <label class="field" for="t">Wat?</label><input class="input" id="t" name="title" required placeholder="Bijv. darttoernooi + borrel">
          <div class="grid2">
            <div><label class="field" for="d">Datum</label><input class="input" type="date" id="d" name="date" required value="${ymd()}"></div>
            <div><label class="field" for="h">Tijd</label><input class="input" type="time" id="h" name="time" required value="16:00"></div>
          </div>
          <label class="field" for="l">Waar?</label><input class="input" id="l" name="location" placeholder="Bijv. kantine">
          <label class="field" for="o">Toelichting</label><textarea class="input" id="o" name="description" rows="2"></textarea>
          <button class="btn primary block" type="submit" style="margin-top:16px">Plaatsen</button>
          <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`,
          async (fd) => {
            const [y, m, d] = fd.get('date').split('-').map(Number), [h, mi] = fd.get('time').split(':').map(Number);
            await q(sb.from('activities').insert({ title: fd.get('title').trim(), location: fd.get('location').trim(), description: fd.get('description').trim(), starts_at: new Date(y, m - 1, d, h, mi).toISOString() }));
            toast('Activiteit geplaatst'); rerender();
          });
      }
      if (act === 'newpoll') {
        sheet(`<form><h2>Nieuwe poll</h2>
          <label class="field" for="qq">Vraag</label><input class="input" id="qq" name="question" required placeholder="Bijv. Kerstuitje – welke datum?">
          <label class="field" for="op">Opties (één per regel)</label>
          <textarea class="input" id="op" name="options" rows="4" required placeholder="Vr 11 december&#10;Vr 18 december&#10;Za 19 december"></textarea>
          <label class="field" for="cl">Sluit op (optioneel)</label><input class="input" type="date" id="cl" name="closes">
          <button class="btn primary block" type="submit" style="margin-top:16px">Poll plaatsen</button>
          <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`,
          async (fd) => {
            const opts = fd.get('options').split('\n').map(s => s.trim()).filter(Boolean);
            if (opts.length < 2) throw new Error('Geef minstens twee opties.');
            let closes = null;
            if (fd.get('closes')) { const [y, m, d] = fd.get('closes').split('-').map(Number); closes = new Date(y, m - 1, d, 23, 59).toISOString(); }
            const poll = await q(sb.from('polls').insert({ question: fd.get('question').trim(), closes_at: closes }).select().single());
            await q(sb.from('poll_options').insert(opts.map((label, i) => ({ poll_id: poll.id, label, sort: i }))));
            toast('Poll geplaatst'); rerender();
          });
      }
    } catch (err) { toast(err.message, true); }
  };
}
