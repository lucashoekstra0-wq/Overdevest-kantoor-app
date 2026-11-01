import { sb, q, personName, loadPeople } from '../sb.js';
import { esc, icon, ring, avatar, weekCode, weekNo, addDays, toast } from '../ui.js';

let picked = null;
let draftReason = null;

export async function render(el, ctx) {
  const me = ctx.me;
  const now = new Date();
  const thisWeek = weekCode(now);
  const weeks = [1, 2, 3, 4, 5, 6, 7].map(i => weekCode(addDays(now, -7 * i)));

  const [people, current, past] = await Promise.all([
    loadPeople(),
    q(sb.from('nominations').select('*').eq('week', thisWeek)),
    q(sb.from('nominations').select('week, nominee, reason, created_at').in('week', weeks))
  ]);

  const tally = (list) => {
    const m = {};
    list.forEach(n => { m[n.nominee] = (m[n.nominee] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1] || personName(a[0]).localeCompare(personName(b[0])));
  };
  const ranking = tally(current);
  const winners = weeks.map(w => {
    const t = tally(past.filter(n => n.week === w));
    if (!t.length) return null;
    const [id, votes] = t[0];
    const reason = past.find(n => n.week === w && n.nominee === id && n.reason)?.reason || '';
    return { week: w, id, votes, reason };
  }).filter(Boolean);
  const last = winners[0] && winners[0].week === weeks[0] ? winners[0] : null;

  const mine = current.find(n => n.nominator === me.id);
  const colleagues = Object.values(people).filter(p => p.active && p.id !== me.id);
  if (!picked || !colleagues.some(c => c.id === picked)) picked = mine?.nominee || null;
  const medal = ['#FFC857', '#C9D2DC', '#E9A27A'];

  el.innerHTML = `
    <section class="page-head">
      <h1>Werknemer van de week</h1>
      <p>Week ${weekNo(now)} · nomineren kan tot en met zondag</p>
    </section>

    <section class="section hero" style="min-height:186px">
      <span aria-hidden="true" style="position:absolute;right:46px;top:-8px;width:20px;height:58px;background:#0FA3B8;transform:skewX(22deg);transform-origin:bottom"></span>
      <span aria-hidden="true" style="position:absolute;right:76px;top:-8px;width:20px;height:58px;background:#E5482D;transform:skewX(-22deg);transform-origin:bottom"></span>
      ${ring('right:22px;top:44px;width:104px;height:120px;border-width:18px;border-color:#E5482D;border-radius:26px')}
      ${last ? `<span class="avatar c0" aria-hidden="true" style="position:absolute;right:40px;top:62px;width:68px;height:84px;border-radius:12px;font-size:22px">${esc(personName(last.id).split(' ').map(s => s[0]).join('').slice(0, 2))}</span>` : ''}
      <div class="eyebrow">Winnaar vorige week</div>
      ${last ? `
        <div class="display" style="font-size:44px;line-height:1;margin-top:6px;max-width:200px">${esc(personName(last.id).split(' ')[0])}</div>
        <div style="font-size:15px;font-weight:600;margin-top:2px">${last.votes} nominatie${last.votes === 1 ? '' : 's'}</div>
        ${last.reason ? `<p style="margin-top:10px;font-size:14px;opacity:.9;max-width:200px">“${esc(last.reason)}”</p>` : ''}`
      : `<div class="display" style="font-size:30px;line-height:1.05;margin-top:8px;max-width:200px">Nog geen winnaar</div>
         <p style="margin-top:8px;font-size:14px;opacity:.9;max-width:200px">Nomineer deze week een collega. Volgende week staat de winnaar hier.</p>`}
    </section>

    <section class="section card" style="padding-bottom:8px">
      <div class="row" style="justify-content:space-between"><h2 class="display" style="font-size:21px">Ranglijst deze week</h2><span class="small muted">nominaties</span></div>
      <ul class="list" style="margin-top:4px">
        ${ranking.length ? ranking.slice(0, 8).map(([id, n], i) => `<li>
          <span style="width:26px;height:26px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;${i < 3 ? `background:${medal[i]}` : 'color:#5B6B7C'}">${i + 1}</span>
          ${avatar(id, personName(id))}
          <span style="flex:1;font-weight:600">${esc(personName(id))}${id === me.id ? ' (jij)' : ''}</span>
          <strong>${n}</strong></li>`).join('') : '<li class="empty">Nog geen nominaties deze week.</li>'}
      </ul>
    </section>

    <section class="section card">
      <h2 style="margin-bottom:10px">Nomineer een collega</h2>
      ${mine ? `<div style="background:#E3F5F8;border-radius:14px;padding:12px 14px;margin-bottom:12px">
        Je hebt <strong>${esc(personName(mine.nominee))}</strong> genomineerd. Je kunt dit nog wijzigen.</div>` : ''}
      <div class="chips" role="group" aria-label="Kies een collega">
        ${colleagues.map(c => `<button class="chip" data-act="pick" data-id="${c.id}" aria-pressed="${picked === c.id}">${esc(c.full_name)}</button>`).join('') || '<span class="empty">Nog geen collega’s aangemeld.</span>'}
      </div>
      <label class="field" for="reason">Waarom verdient ${picked ? esc(personName(picked).split(' ')[0]) : 'diegene'} het?</label>
      <textarea class="input" id="reason" rows="2" placeholder="Bijv. hielp me uit de brand met de DO-tekeningen">${esc(draftReason ?? mine?.reason ?? '')}</textarea>
      <button class="btn primary block" data-act="send" style="margin-top:12px" ${picked ? '' : 'disabled'}>${mine ? 'Nominatie bijwerken' : 'Nominatie versturen'}</button>
      ${mine ? `<button class="linkbtn" data-act="withdraw" style="margin-top:4px">Nominatie intrekken</button>` : ''}
      <p class="small muted" style="margin-top:8px">Eén nominatie per week. Jezelf nomineren kan niet.</p>
    </section>

    ${winners.length ? `<h2 class="section-title">Eerdere winnaars</h2>
    <div style="display:flex;gap:10px;overflow-x:auto;padding:0 16px 4px">
      ${winners.map(w => `<div class="card" style="flex-shrink:0;width:112px;padding:12px;text-align:center">
        <div style="display:flex;justify-content:center;margin-bottom:6px">${avatar(w.id, personName(w.id), 'md')}</div>
        <div style="font-weight:700;font-size:15px">${esc(personName(w.id).split(' ')[0])}</div>
        <div class="small muted">week ${Number(w.week.slice(-2))}</div></div>`).join('')}
    </div>` : ''}
    <div style="height:16px"></div>
  `;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    try {
      if (b.dataset.act === 'pick') { draftReason = el.querySelector('#reason').value; picked = b.dataset.id; render(el, ctx); }
      if (b.dataset.act === 'send') {
        const reason = el.querySelector('#reason').value.trim();
        await q(sb.from('nominations').upsert({ week: thisWeek, nominator: me.id, nominee: picked, reason }, { onConflict: 'week,nominator' }));
        draftReason = null; toast('Nominatie verstuurd'); render(el, ctx);
      }
      if (b.dataset.act === 'withdraw') {
        await q(sb.from('nominations').delete().eq('week', thisWeek).eq('nominator', me.id));
        picked = null; toast('Nominatie ingetrokken'); render(el, ctx);
      }
    } catch (err) { toast(err.message, true); }
  };
}
