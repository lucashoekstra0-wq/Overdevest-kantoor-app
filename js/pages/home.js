import { sb, q, personName } from '../sb.js';
import { esc, icon, ring, avatar, ymd, hm, isoDow, cap, longDate, ago, toast, sheet } from '../ui.js';
import { getSettings } from './shared.js';

export async function render(el, ctx) {
  const me = ctx.me;
  const today = ymd();
  const workday = isoDow() <= 5;
  const nowIso = new Date().toISOString();
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59);

  const [settings, presence, myBookings, bdays, myOrder, polls, lastPost, rooms, busyNow] = await Promise.all([
    getSettings(),
    q(sb.from('presence').select('status').eq('user_id', me.id).eq('day', today).maybeSingle()),
    q(sb.from('bookings').select('id, title, starts_at, ends_at, room_id').eq('user_id', me.id).gte('ends_at', nowIso).lte('starts_at', endOfDay.toISOString()).order('starts_at')),
    q(sb.rpc('upcoming_birthdays', { days: 2 })),
    q(sb.from('lunch_orders').select('joins').eq('user_id', me.id).eq('day', today).maybeSingle()),
    q(sb.from('polls').select('id, question, closes_at, poll_options(id, label, sort), poll_votes(user_id, option_id)').or(`closes_at.is.null,closes_at.gt.${nowIso}`).order('created_at', { ascending: false }).limit(1)),
    q(sb.from('posts').select('id, author, category, body, created_at').order('created_at', { ascending: false }).limit(1)),
    q(sb.from('rooms').select('id, name').eq('active', true).order('sort')),
    q(sb.from('bookings').select('room_id, ends_at').lte('starts_at', nowIso).gte('ends_at', nowIso))
  ]);

  const roomName = Object.fromEntries(rooms.map(r => [r.id, r.name]));
  let duties = [];
  if (workday) {
    const tafel = await q(sb.rpc('assign_duty', { d: today, k: 'tafel' }));
    const airfryer = await q(sb.rpc('assign_duty', { d: today, k: 'airfryer' }));
    if (tafel === me.id) duties.push('tafel');
    if (airfryer === me.id) duties.push('airfryer');
  }

  const status = presence?.status || null;
  const h = new Date().getHours();
  const greet = h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
  const firstName = me.full_name.split(' ')[0];
  const freeRoom = rooms.find(r => !busyNow.some(b => b.room_id === r.id));
  const snackDay = isoDow() === Number(settings.snack_day);
  const deadline = settings.lunch_deadline;

  // "Voor jou vandaag"
  const items = [];
  myBookings.forEach(b => items.push(`<li>${tile('agenda')}<span><strong>${hm(b.starts_at)} ${esc(b.title)}</strong><span class="small" style="display:block;opacity:.8">${esc(roomName[b.room_id] || '')}</span></span></li>`));
  if (duties.includes('tafel')) items.push(`<li>${tile('table', true)}<span><strong>Jij dekt vandaag de lunchtafel</strong><a href="#/lunch" class="small" style="display:block;color:#9EE3EC">Bekijken of ruilen</a></span></li>`);
  if (duties.includes('airfryer')) items.push(`<li>${tile('lunch', true)}<span><strong>Jij staat bij de airfryer</strong><a href="#/lunch" class="small" style="display:block;color:#9EE3EC">Bekijk de bestellingen</a></span></li>`);
  bdays.forEach(b => {
    const isToday = b.birthday === today;
    items.push(`<li>${tile('gift')}<span><strong>${esc(b.full_name)} is ${isToday ? 'vandaag' : 'morgen'} jarig</strong><a href="#/social" class="small" style="display:block;color:#9EE3EC">Feliciteer</a></span></li>`);
  });
  if (!items.length) items.push(`<li>${tile('check')}<span><strong>Niets op je lijstje</strong><span class="small" style="display:block;opacity:.8">Fijne dag!</span></span></li>`);

  const poll = polls[0];

  el.innerHTML = `
    <section class="page-head">
      <p style="margin:0">${cap(longDate(new Date()))}</p>
      <h1 style="margin:2px 0 14px">${greet}, ${esc(firstName)}</h1>
      ${workday ? `<div class="seg" role="group" aria-label="Waar werk je vandaag?">
        ${[['kantoor', 'Op kantoor'], ['thuis', 'Thuis'], ['vrij', 'Vrij']].map(([v, l]) =>
          `<button data-act="presence" data-v="${v}" aria-pressed="${status === v}">${l}</button>`).join('')}
      </div>
      ${!status ? '<p class="small muted" style="margin-top:6px">Laat even weten waar je bent. Dat helpt de lunchroulette.</p>' : ''}` : ''}
    </section>

    <section class="section hero" style="padding-bottom:10px">
      ${ring('right:-70px;top:-64px;width:150px;height:170px;border-width:20px;border-color:#E5482D;border-radius:40px')}
      ${ring('right:-30px;bottom:-60px;width:90px;height:100px;border-width:14px;border-color:#0FA3B8;border-radius:28px')}
      <div class="eyebrow">Voor jou vandaag</div>
      <ul class="list today" style="max-width:250px;margin-top:6px">${items.join('')}</ul>
    </section>

    <h2 class="section-title">Snel regelen</h2>
    <section class="section grid2" style="margin-top:0">
      ${quick('#/lunch', 'lunch', '#C93A1F', '#FDECE8', 'Lunch bestellen',
        myOrder ? (myOrder.joins ? 'Je eet mee ✓' : 'Je eet niet mee') : workday ? (snackDay ? `Snacks! Sluit ${deadline}` : `Sluit ${deadline}`) : 'Volgende werkdag', !myOrder && workday)}
      ${quick('#/koffie', 'coffee', '#0B7285', '#E3F5F8', 'Koffie aanvragen', ctx.pendingCoffee ? `${ctx.pendingCoffee} open verzoek${ctx.pendingCoffee > 1 ? 'en' : ''}` : 'Naar je vergadering')}
      ${quick('#/agenda', 'room', '#0B2E4F', '#E6EBF0', 'Ruimte boeken', freeRoom ? `${esc(freeRoom.name)} nu vrij` : 'Alles bezet')}
      <button class="card" data-act="shop" style="border:0;text-align:left;display:flex;flex-direction:column;gap:10px;min-height:96px;padding:14px">
        <span style="width:40px;height:40px;border-radius:12px;background:#FFF2D6;display:flex;align-items:center;justify-content:center">${icon('cart', 20, '#8A5A00')}</span>
        <span><strong style="display:block;font-size:15px">Iets is op</strong><span class="small muted">Op de boodschappenlijst</span></span>
      </button>
    </section>

    ${poll ? pollCard(poll, me.id) : ''}

    ${lastPost.length ? `
      <h2 class="section-title">Nieuw op Social <a href="#/social">Alles bekijken</a></h2>
      <article class="section card row" style="margin-top:0;align-items:flex-start">
        ${avatar(lastPost[0].author, personName(lastPost[0].author), 'md')}
        <div><div style="font-size:14px"><strong>${esc(personName(lastPost[0].author))}</strong> <span class="muted">· ${esc(cap(lastPost[0].category))} · ${ago(lastPost[0].created_at)}</span></div>
        <p style="margin-top:4px;font-size:15px">${esc(lastPost[0].body.slice(0, 160))}${lastPost[0].body.length > 160 ? '…' : ''}</p></div>
      </article>` : ''}
  `;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      if (b.dataset.act === 'presence') {
        await q(sb.from('presence').upsert({ user_id: me.id, day: today, status: b.dataset.v }));
        render(el, ctx);
      }
      if (b.dataset.act === 'vote') {
        const pid = Number(b.dataset.poll), oid = Number(b.dataset.opt);
        if (b.getAttribute('aria-pressed') === 'true') await q(sb.from('poll_votes').delete().eq('poll_id', pid).eq('user_id', me.id));
        else await q(sb.from('poll_votes').upsert({ poll_id: pid, user_id: me.id, option_id: oid }));
        render(el, ctx);
      }
      if (b.dataset.act === 'shop') {
        sheet(`<form><h2>Wat is er op?</h2>
          <label class="field" for="nm">Product</label><input class="input" id="nm" name="name" required placeholder="Bijv. melk">
          <div class="seg dark" style="margin-top:12px" role="group" aria-label="Hoe dringend">
            <label style="display:contents"><input type="radio" name="status" value="op" checked class="sr-only"><button type="button" aria-pressed="true" data-radio="op">Helemaal op</button></label>
            <label style="display:contents"><input type="radio" name="status" value="bijna" class="sr-only"><button type="button" aria-pressed="false" data-radio="bijna">Bijna op</button></label>
          </div>
          <button class="btn primary block" type="submit" style="margin-top:16px">Op de lijst zetten</button>
          <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`,
          async (fd) => { await q(sb.from('shopping_items').insert({ name: fd.get('name').trim(), status: fd.get('status') })); toast('Op de boodschappenlijst gezet'); });
        wireRadios();
      }
    } catch (err) { toast(err.message, true); }
  };
}

function tile(name, orange = false) {
  return `<span style="width:36px;height:36px;border-radius:10px;background:${orange ? '#E5482D' : 'rgba(255,255,255,.12)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon(name, 18, '#fff')}</span>`;
}

function quick(href, ic, color, bg, title, sub, alert = false) {
  return `<a href="${href}" class="card" style="text-decoration:none;display:flex;flex-direction:column;gap:10px;min-height:96px;padding:14px">
    <span style="width:40px;height:40px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center">${icon(ic, 20, color)}</span>
    <span><strong style="display:block;font-size:15px">${title}</strong><span class="small" style="color:${alert ? '#C93A1F' : '#5B6B7C'};font-weight:${alert ? 600 : 400}">${sub}</span></span></a>`;
}

export function pollCard(poll, myId) {
  const opts = [...poll.poll_options].sort((a, b) => a.sort - b.sort || a.id - b.id);
  const total = poll.poll_votes.length;
  const mine = poll.poll_votes.find(v => v.user_id === myId)?.option_id;
  return `<section class="section card" style="margin-top:22px">
    <div class="row" style="justify-content:space-between">
      <span class="eyebrow" style="color:#0B7285">Poll${poll.closes_at ? ' · sluit ' + esc(longDate(poll.closes_at).split(' ').slice(0, 1)[0]) : ''}</span>
      <span class="small muted">${total} stem${total === 1 ? '' : 'men'}</span>
    </div>
    <h3 style="margin:6px 0 12px;font-size:18px">${esc(poll.question)}</h3>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${opts.map(o => {
        const n = poll.poll_votes.filter(v => v.option_id === o.id).length;
        const pct = total ? Math.round(n / total * 100) : 0;
        const on = mine === o.id;
        return `<button class="poll-opt" data-act="vote" data-poll="${poll.id}" data-opt="${o.id}" aria-pressed="${on}"
          style="background:linear-gradient(90deg,${on ? '#BDEAF0' : '#E3F5F8'} ${pct}%,#fff ${pct}%)">
          <span>${esc(o.label)}${on ? ' ✓' : ''}</span><span>${pct}%</span></button>`;
      }).join('')}
    </div></section>`;
}

export function wireRadios() {
  document.querySelectorAll('[data-radio]').forEach(btn => btn.addEventListener('click', () => {
    const group = btn.closest('.seg');
    group.querySelectorAll('[data-radio]').forEach(x => x.setAttribute('aria-pressed', x === btn));
    group.querySelector(`input[value="${btn.dataset.radio}"]`).checked = true;
  }));
}
