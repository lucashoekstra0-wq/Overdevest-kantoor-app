import { sb, q, loadPeople } from '../sb.js';
import { esc, icon, ring, avatar, toast } from '../ui.js';

export async function render(el, ctx) {
  const me = ctx.me;
  const priv = await q(sb.from('private_profiles').select('birthday').eq('user_id', me.id).maybeSingle());
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  el.innerHTML = `
    <section class="section hero" style="margin-top:16px;padding:20px">
      ${ring('right:-44px;bottom:-50px;width:140px;height:150px;border-width:18px;border-color:#0FA3B8;border-radius:36px')}
      <img src="img/logo-white.png" alt="" style="display:block;height:14px;width:87px;opacity:.85">
      <div class="row" style="gap:14px;margin-top:16px">
        ${avatar(me.id, me.full_name, 'lg')}
        <div>
          <div class="display" style="font-size:26px;line-height:1.1">${esc(me.full_name)}</div>
          <div class="small" style="opacity:.85">${esc(me.email)}</div>
          ${me.is_admin ? '<span class="badge red" style="display:inline-block;margin-top:6px">Beheerder</span>' : ''}
        </div>
      </div>
    </section>

    <form class="section card" id="pf">
      <h2>Mijn gegevens</h2>
      <label class="field" for="nm">Naam zoals collega's die zien</label>
      <input class="input" id="nm" name="full_name" required value="${esc(me.full_name)}">
      <label class="field" for="bd">Verjaardag</label>
      <input class="input" type="date" id="bd" name="birthday" value="${esc(priv?.birthday || '')}">
      <div class="row" style="margin-top:14px">
        <div style="flex:1"><div style="font-weight:600">Verjaardag tonen</div><div class="small muted">Collega's zien je verjaardag en kunnen je feliciteren</div></div>
        <button type="button" class="switch" role="switch" id="sb" aria-checked="${me.show_birthday}" aria-label="Verjaardag tonen"></button>
      </div>
      <button class="btn navy block" type="submit" style="margin-top:16px">Opslaan</button>
    </form>

    ${!standalone ? `<section class="section card" style="border:1.5px dashed #0B7285">
      <h2>Zet de app op je beginscherm</h2>
      <p class="small" style="margin-top:6px">${ios
        ? 'Tik in Safari op de deelknop (vierkantje met pijl) en kies <strong>Zet op beginscherm</strong>.'
        : 'Tik in Chrome op het menu (drie puntjes) en kies <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.'}</p>
    </section>` : ''}

    ${me.is_admin ? `<section class="section card" style="padding:4px 16px">
      <a href="#/beheer" class="row" style="min-height:56px;text-decoration:none">
        ${icon('settings', 22)}<span style="flex:1;font-weight:700">Beheer</span>${icon('chevron', 18, '#5B6B7C')}</a>
    </section>` : ''}

    <div class="section" style="margin-top:20px">
      <button class="btn danger block" id="logout">Uitloggen</button>
      <p class="small muted" style="text-align:center;margin-top:10px">Overdevest App · versie 1.0</p>
    </div>
  `;

  const sw = el.querySelector('#sb');
  sw.addEventListener('click', () => sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') !== 'true'));
  el.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const updated = await q(sb.from('profiles').update({ full_name: fd.get('full_name').trim(), show_birthday: sw.getAttribute('aria-checked') === 'true' }).eq('id', me.id).select().single());
      await q(sb.from('private_profiles').upsert({ user_id: me.id, birthday: fd.get('birthday') || null }));
      Object.assign(me, updated);
      await loadPeople(true);
      toast('Opgeslagen');
    } catch (err) { toast(err.message, true); }
  });
  el.querySelector('#logout').addEventListener('click', () => sb.auth.signOut());
}
