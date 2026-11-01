import { sb, q, loadPeople, uploadPublic } from '../sb.js';
import { esc, icon, ymd, toast, sheet, longDate, fromYmd } from '../ui.js';
import { getSettings } from './shared.js';

let tab = 'mensen';

export async function render(el, ctx) {
  el.innerHTML = `
    <section class="page-head"><h1>Beheer</h1><p>Alleen zichtbaar voor beheerders</p></section>
    <div class="chips scroll" role="tablist">
      ${[['mensen', 'Medewerkers'], ['lunch', 'Lunch'], ['ruimtes', 'Ruimtes'], ['social', 'LinkedIn & Insta'], ['tv', 'TV-scherm']].map(([v, l]) =>
        `<button class="chip" role="tab" data-tab="${v}" aria-pressed="${tab === v}">${l}</button>`).join('')}
    </div>
    <div id="sub"><div class="loading">Laden…</div></div>`;
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(el, ctx); }));
  const sub = el.querySelector('#sub');
  const views = { mensen, lunch, ruimtes, social, tv };
  await views[tab](sub, ctx);
}

// ---------------- Medewerkers ----------------
async function mensen(el, ctx) {
  const people = Object.values(await loadPeople(true));
  el.innerHTML = `
    <section class="section card" style="padding:4px 16px">
      <ul class="list">
        ${people.map(p => `<li style="flex-wrap:wrap;padding:10px 0">
          <div style="flex:1;min-width:180px"><div style="font-weight:700">${esc(p.full_name)}${p.id === ctx.me.id ? ' (jij)' : ''}</div><div class="small muted">${esc(p.email)}</div></div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            ${toggle(p, 'is_admin', 'Beheerder', p.id === ctx.me.id)}
            ${toggle(p, 'in_roulette', 'Roulette')}
            ${toggle(p, 'active', 'Actief', p.id === ctx.me.id)}
          </div></li>`).join('')}
      </ul>
    </section>
    <p class="section small muted">Nieuwe collega's verschijnen hier automatisch zodra ze voor het eerst inloggen. Zet "Actief" uit voor collega's die uit dienst zijn.</p>`;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-flag]');
    if (!b) return;
    try {
      await q(sb.from('profiles').update({ [b.dataset.flag]: b.getAttribute('aria-pressed') !== 'true' }).eq('id', b.dataset.id));
      mensen(el, ctx);
    } catch (err) { toast(err.message, true); }
  };
}
function toggle(p, flag, label, disabled = false) {
  return `<button class="chip" data-flag="${flag}" data-id="${p.id}" aria-pressed="${!!p[flag]}" ${disabled ? 'disabled style="opacity:.6"' : ''} style="min-height:36px;font-size:13px">${label}</button>`;
}

// ---------------- Lunch ----------------
async function lunch(el, ctx) {
  const s = await getSettings(true);
  const snacks = await q(sb.from('snacks').select('*').order('sort'));
  const people = await loadPeople();
  const today = ymd();
  const duties = await q(sb.from('duties').select('*').eq('day', today));
  const dayNames = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag'];

  el.innerHTML = `
    <form class="section card" id="lf">
      <h2>Tijden</h2>
      <div class="grid2">
        <div><label class="field" for="dl">Bestellen tot</label><input class="input" type="time" id="dl" name="lunch_deadline" value="${esc(s.lunch_deadline)}"></div>
        <div><label class="field" for="rt">Roulette om</label><input class="input" type="time" id="rt" name="roulette_time" value="${esc(s.roulette_time)}"></div>
      </div>
      <label class="field" for="sd">Snackdag (airfryer)</label>
      <select class="input" id="sd" name="snack_day">${[1, 2, 3, 4, 5].map(d => `<option value="${d}" ${Number(s.snack_day) === d ? 'selected' : ''}>${dayNames[d]}</option>`).join('')}</select>
      <button class="btn navy block" type="submit" style="margin-top:14px">Opslaan</button>
    </form>

    <section class="section card">
      <div class="row" style="justify-content:space-between"><h2>Snacks</h2><button class="btn soft sm" data-act="addsnack">${icon('plus', 16)}Snack</button></div>
      <ul class="list" style="margin-top:6px">${snacks.map(sn => `<li>
        <span style="flex:1;font-weight:600;${sn.active ? '' : 'color:#5B6B7C;text-decoration:line-through'}">${esc(sn.name)}</span>
        <button class="chip" data-act="snack" data-id="${sn.id}" aria-pressed="${sn.active}" style="min-height:36px;font-size:13px">${sn.active ? 'Aan' : 'Uit'}</button></li>`).join('')}</ul>
    </section>

    <section class="section card">
      <h2>Taken vandaag aanpassen</h2>
      ${['tafel', 'airfryer'].map(k => {
        const d = duties.find(x => x.kind === k);
        return `<label class="field" for="du-${k}">${k === 'tafel' ? 'Tafel dekken' : 'Airfryer'}</label>
          <select class="input" id="du-${k}" data-duty="${k}"><option value="">${d ? '' : '— nog niet geloot —'}</option>
          ${Object.values(people).filter(p => p.active).map(p => `<option value="${p.id}" ${d?.user_id === p.id ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select>`;
      }).join('')}
    </section>`;

  el.querySelector('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await q(sb.from('settings').upsert([
        { key: 'lunch_deadline', value: fd.get('lunch_deadline') },
        { key: 'roulette_time', value: fd.get('roulette_time') },
        { key: 'snack_day', value: Number(fd.get('snack_day')) }
      ]));
      await getSettings(true);
      toast('Opgeslagen');
    } catch (err) { toast(err.message, true); }
  });
  el.querySelectorAll('[data-duty]').forEach(sel => sel.addEventListener('change', async () => {
    try {
      if (!sel.value) await q(sb.from('duties').delete().eq('day', today).eq('kind', sel.dataset.duty));
      else await q(sb.from('duties').upsert({ day: today, kind: sel.dataset.duty, user_id: sel.value }));
      toast('Taak aangepast');
    } catch (err) { toast(err.message, true); }
  }));
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      if (b.dataset.act === 'snack') { await q(sb.from('snacks').update({ active: b.getAttribute('aria-pressed') !== 'true' }).eq('id', b.dataset.id)); lunch(el, ctx); }
      if (b.dataset.act === 'addsnack') sheet(`<form><h2>Snack toevoegen</h2>
        <label class="field" for="sn">Naam</label><input class="input" id="sn" name="name" required>
        <button class="btn primary block" type="submit" style="margin-top:16px">Toevoegen</button>
        <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`,
        async (fd) => { await q(sb.from('snacks').insert({ name: fd.get('name').trim(), sort: snacks.length + 1 })); lunch(el, ctx); });
    } catch (err) { toast(err.message, true); }
  };
}

// ---------------- Ruimtes ----------------
async function ruimtes(el, ctx) {
  const rooms = await q(sb.from('rooms').select('*').order('sort'));
  el.innerHTML = `
    <section class="section card">
      <div class="row" style="justify-content:space-between"><h2>Ruimtes</h2><button class="btn soft sm" data-act="add">${icon('plus', 16)}Ruimte</button></div>
      <ul class="list" style="margin-top:6px">${rooms.map(r => `<li>
        <div style="flex:1"><div style="font-weight:700;${r.active ? '' : 'color:#5B6B7C'}">${esc(r.name)}</div><div class="small muted">${r.capacity} pers.${r.features ? ' · ' + esc(r.features) : ''}</div></div>
        <button class="linkbtn" data-act="edit" data-id="${r.id}">Wijzig</button>
        <button class="chip" data-act="toggle" data-id="${r.id}" aria-pressed="${r.active}" style="min-height:36px;font-size:13px">${r.active ? 'Actief' : 'Uit'}</button></li>`).join('')}</ul>
    </section>`;
  const form = (r = {}) => `<form><h2>${r.id ? 'Ruimte wijzigen' : 'Ruimte toevoegen'}</h2>
    <label class="field" for="rn">Naam</label><input class="input" id="rn" name="name" required value="${esc(r.name || '')}">
    <div class="grid2"><div><label class="field" for="rc">Personen</label><input class="input" type="number" min="1" id="rc" name="capacity" value="${r.capacity || 4}"></div>
    <div><label class="field" for="rs">Volgorde</label><input class="input" type="number" id="rs" name="sort" value="${r.sort ?? rooms.length + 1}"></div></div>
    <label class="field" for="rf">Voorzieningen</label><input class="input" id="rf" name="features" value="${esc(r.features || '')}" placeholder="Bijv. scherm, whiteboard">
    <button class="btn primary block" type="submit" style="margin-top:16px">Opslaan</button>
    <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const r = rooms.find(x => String(x.id) === b.dataset.id);
    const save = async (fd) => {
      const row = { name: fd.get('name').trim(), capacity: Number(fd.get('capacity')), sort: Number(fd.get('sort')), features: fd.get('features').trim() };
      if (r) await q(sb.from('rooms').update(row).eq('id', r.id)); else await q(sb.from('rooms').insert(row));
      ruimtes(el, ctx);
    };
    try {
      if (b.dataset.act === 'add') sheet(form(), save);
      if (b.dataset.act === 'edit') sheet(form(r), save);
      if (b.dataset.act === 'toggle') { await q(sb.from('rooms').update({ active: !r.active }).eq('id', r.id)); ruimtes(el, ctx); }
    } catch (err) { toast(err.message, true); }
  };
}

// ---------------- LinkedIn & Instagram ----------------
async function social(el, ctx) {
  const list = await q(sb.from('social_highlights').select('*').order('posted_on', { ascending: false }).order('id', { ascending: false }).limit(30));
  el.innerHTML = `
    <section class="section card">
      <h2>Post uitlichten</h2>
      <p class="small muted" style="margin-top:4px">Zet hier de nieuwste LinkedIn- of Instagram-post van Overdevest neer. De laatste van elk platform verschijnt op Social en op het TV-scherm.</p>
      <button class="btn primary block" data-act="add" style="margin-top:12px">${icon('plus', 18, '#fff')}Post toevoegen</button>
    </section>
    <section class="section card" style="padding:4px 16px">
      <ul class="list">${list.map(h => `<li>
        <span class="badge ${h.platform === 'linkedin' ? 'navy' : 'red'}">${h.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'}</span>
        <div style="flex:1;min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.body || h.url || '(zonder tekst)')}</div><div class="small muted">${esc(longDate(fromYmd(h.posted_on)))}</div></div>
        <button class="iconbtn" data-act="del" data-id="${h.id}" aria-label="Verwijderen">${icon('trash', 18, '#5B6B7C')}</button></li>`).join('') || '<li class="empty">Nog niets toegevoegd.</li>'}</ul>
    </section>`;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      if (b.dataset.act === 'del' && confirm('Verwijderen?')) { await q(sb.from('social_highlights').delete().eq('id', b.dataset.id)); social(el, ctx); }
      if (b.dataset.act === 'add') sheet(`<form><h2>Post uitlichten</h2>
        <label class="field" for="pl">Platform</label>
        <select class="input" id="pl" name="platform"><option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option></select>
        <label class="field" for="ur">Link naar de post</label><input class="input" type="url" id="ur" name="url" placeholder="https://www.linkedin.com/posts/…">
        <label class="field" for="bo">Tekst (eerste regels)</label><textarea class="input" id="bo" name="body" rows="3"></textarea>
        <label class="field" for="im">Afbeelding</label><input class="input" type="file" id="im" name="image" accept="image/*">
        <label class="field" for="po">Geplaatst op</label><input class="input" type="date" id="po" name="posted_on" value="${ymd()}">
        <button class="btn primary block" type="submit" style="margin-top:16px">Opslaan</button>
        <button class="btn ghost block" type="button" data-close style="margin-top:8px">Annuleren</button></form>`,
        async (fd) => {
          const file = fd.get('image');
          const image_url = file && file.size ? await uploadPublic(file) : '';
          await q(sb.from('social_highlights').insert({ platform: fd.get('platform'), url: fd.get('url').trim(), body: fd.get('body').trim(), image_url, posted_on: fd.get('posted_on') || ymd() }));
          toast('Toegevoegd'); social(el, ctx);
        });
    } catch (err) { toast(err.message, true); }
  };
}

// ---------------- TV ----------------
async function tv(el, ctx) {
  const row = await q(sb.from('settings').select('value').eq('key', 'tv_key').single());
  const key = row.value;
  const base = location.origin + location.pathname.replace(/index\.html$/, '');
  const url = `${base}tv.html?key=${encodeURIComponent(key)}`;
  el.innerHTML = `
    <section class="section card">
      <h2>Link voor het TV-scherm</h2>
      <p class="small muted" style="margin-top:4px">Open deze link in de browser van de TV (volledig scherm). De TV hoeft niet in te loggen. Deel de link alleen binnen kantoor.</p>
      <input class="input" readonly value="${esc(url)}" id="tvurl" style="margin-top:12px;font-size:14px" aria-label="TV-link">
      <div class="grid2" style="margin-top:10px">
        <button class="btn navy" data-act="copy">Kopieer link</button>
        <a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener">Open</a>
      </div>
      <button class="linkbtn" data-act="new" style="margin-top:8px">Nieuwe link maken (oude stopt met werken)</button>
    </section>`;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      if (b.dataset.act === 'copy') { await navigator.clipboard.writeText(url); toast('Gekopieerd'); }
      if (b.dataset.act === 'new' && confirm('Nieuwe TV-link maken? De oude link werkt dan niet meer.')) {
        const k = Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2, '0')).join('');
        await q(sb.from('settings').update({ value: k }).eq('key', 'tv_key'));
        tv(el, ctx);
      }
    } catch (err) { toast(err.message, true); }
  };
}
