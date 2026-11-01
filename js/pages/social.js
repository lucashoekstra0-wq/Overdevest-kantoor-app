import { sb, q, personName, photoUrls, uploadPhoto } from '../sb.js';
import { esc, icon, ring, avatar, ago, cap, ymd, toast, sheet, fromYmd, longDate } from '../ui.js';
import { LINKEDIN_URL, INSTAGRAM_URL } from '../config.js';

const CATS = [['alles', 'Alles'], ['online', 'LinkedIn & Insta'], ['foto', 'Foto van de week'], ['projecten', 'Projecten'], ['kantoor', 'Kantoor'], ['activiteiten', 'Activiteiten'], ['algemeen', 'Algemeen']];
let cat = 'alles';

export async function render(el, ctx) {
  const me = ctx.me;
  let postsQ = sb.from('posts').select('*, likes(user_id), comments(id)').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(40);
  if (!['alles', 'online'].includes(cat)) postsQ = postsQ.eq('category', cat);

  const [posts, highlights, bdays] = await Promise.all([
    cat === 'online' ? Promise.resolve([]) : q(postsQ),
    ['alles', 'online'].includes(cat) ? q(sb.from('social_highlights').select('*').order('posted_on', { ascending: false }).order('id', { ascending: false }).limit(cat === 'online' ? 20 : 6)) : Promise.resolve([]),
    cat === 'alles' ? q(sb.rpc('upcoming_birthdays', { days: 1 })) : Promise.resolve([])
  ]);
  const urls = await photoUrls(posts.map(p => p.image_path));

  // In "Alles": de nieuwste LinkedIn- en Instagram-post
  const latest = cat === 'online' ? highlights : ['linkedin', 'instagram'].map(pl => highlights.find(h => h.platform === pl)).filter(Boolean);
  const pinned = posts.filter(p => p.pinned);
  const rest = posts.filter(p => !p.pinned);

  // Foto van de week: meeste likes in de afgelopen 7 dagen
  const weekAgo = Date.now() - 7 * 86400000;
  const fotoRank = posts.filter(p => p.category === 'foto' && new Date(p.created_at) > weekAgo).sort((a, b) => b.likes.length - a.likes.length)[0];

  el.innerHTML = `
    <section class="page-head"><h1>Social</h1></section>

    <form class="section card" id="composer" style="padding:12px">
      <div class="row" style="gap:10px;align-items:flex-start">
        ${avatar(me.id, me.full_name, 'md')}
        <label for="body" class="sr-only">Nieuw bericht</label>
        <textarea id="body" name="body" rows="1" placeholder="Deel iets met kantoor…" class="input" style="min-height:44px;border:0;background:#F3F5F8;border-radius:22px;padding:11px 14px;resize:none"></textarea>
      </div>
      <div id="extra" hidden style="margin-top:10px">
        <img id="preview" alt="" style="display:none;width:100%;max-height:240px;object-fit:cover;border-radius:14px;margin-bottom:10px">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <label class="sr-only" for="cat">Categorie</label>
          <select class="input" id="cat" name="category" style="flex:1;min-width:140px">
            ${CATS.slice(2).map(([v, l]) => `<option value="${v}" ${v === (['alles', 'online'].includes(cat) ? 'algemeen' : cat) ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <label class="btn soft sm" style="background:#FDECE8;color:#C93A1F">${icon('camera', 18, '#C93A1F')}Foto
            <input type="file" name="photo" accept="image/*" class="sr-only" id="photo"></label>
          <button class="btn primary sm" type="submit">Plaatsen</button>
        </div>
      </div>
    </form>

    <div class="chips scroll" role="group" aria-label="Filter">
      ${CATS.map(([v, l]) => `<button class="chip" data-act="cat" data-v="${v}" aria-pressed="${cat === v}">${l}</button>`).join('')}
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;padding:0 16px">
      ${bdays.map(b => `<article class="hero teal">
        ${ring('right:-34px;top:-40px;width:120px;height:130px;border-width:16px;border-color:#fff;border-radius:32px;opacity:.55')}
        <div class="eyebrow">${b.birthday === ymd() ? 'Vandaag jarig' : 'Morgen jarig'}</div>
        <div class="display" style="font-size:26px;margin:2px 0 10px">${esc(b.full_name)}</div>
        <button class="btn navy sm" data-act="congrats" data-name="${esc(b.full_name)}">Feliciteer op Social</button>
      </article>`).join('')}

      ${pinned.map(p => postCard(p, me, urls, true)).join('')}

      ${latest.map(h => highlightCard(h)).join('')}
      ${cat === 'online' && !latest.length ? `<div class="card"><p class="empty">Nog geen posts toegevoegd. Beheerders kunnen de laatste LinkedIn- en Instagram-post toevoegen via Beheer.</p>
        <div class="row" style="gap:8px;margin-top:8px"><a class="btn ghost sm" href="${esc(LINKEDIN_URL)}" target="_blank" rel="noopener">LinkedIn</a><a class="btn ghost sm" href="${esc(INSTAGRAM_URL)}" target="_blank" rel="noopener">Instagram</a></div></div>` : ''}

      ${cat === 'foto' ? `<div class="card" style="background:#FDECE8"><strong>Foto van de week</strong><p class="small" style="margin-top:4px">Plaats een foto in deze categorie. De foto met de meeste likes van de afgelopen 7 dagen wint en komt op de TV.</p></div>` : ''}

      ${rest.map(p => postCard(p, me, urls, false, fotoRank && p.id === fotoRank.id && p.likes.length > 0)).join('')}
      ${cat !== 'online' && !posts.length ? '<div class="card"><p class="empty">Nog geen berichten. Wees de eerste!</p></div>' : ''}
    </div>
    <div style="height:24px"></div>
  `;

  const form = el.querySelector('#composer');
  const body = form.querySelector('#body');
  body.addEventListener('focus', () => { form.querySelector('#extra').hidden = false; body.rows = 3; });
  form.querySelector('#photo').addEventListener('change', (e) => {
    const f = e.target.files[0], img = form.querySelector('#preview');
    if (f) { img.src = URL.createObjectURL(f); img.style.display = 'block'; form.querySelector('#extra').hidden = false; }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const file = form.querySelector('#photo').files[0];
    const text = body.value.trim();
    if (!text && !file) return toast('Schrijf iets of kies een foto', true);
    btn.disabled = true; btn.textContent = 'Bezig…';
    try {
      const image_path = file ? await uploadPhoto(file) : null;
      await q(sb.from('posts').insert({ body: text, category: form.category.value, image_path }));
      toast('Geplaatst'); render(el, ctx);
    } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Plaatsen'; }
  });

  el.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = Number(b.dataset.id);
    try {
      if (b.dataset.act === 'cat') { cat = b.dataset.v; render(el, ctx); }
      if (b.dataset.act === 'like') {
        if (b.getAttribute('aria-pressed') === 'true') await q(sb.from('likes').delete().eq('post_id', id).eq('user_id', me.id));
        else await q(sb.from('likes').insert({ post_id: id, user_id: me.id }));
        render(el, ctx);
      }
      if (b.dataset.act === 'comments') commentsSheet(id, me, () => render(el, ctx));
      if (b.dataset.act === 'pin') { await q(sb.from('posts').update({ pinned: b.dataset.v !== 'true' }).eq('id', id)); render(el, ctx); }
      if (b.dataset.act === 'del' && confirm('Bericht verwijderen?')) {
        const p = posts.find(x => x.id === id);
        await q(sb.from('posts').delete().eq('id', id));
        if (p?.image_path) await sb.storage.from('photos').remove([p.image_path]);
        render(el, ctx);
      }
      if (b.dataset.act === 'congrats') { body.value = `Gefeliciteerd ${b.dataset.name}! 🎉`; body.focus(); }
    } catch (err) { toast(err.message, true); }
  };
}

function postCard(p, me, urls, pinned, isPhotoLeader = false) {
  const liked = p.likes.some(l => l.user_id === me.id);
  const canEdit = p.author === me.id || me.is_admin;
  const img = p.image_path && urls[p.image_path];
  return `<article class="card" style="padding:0;overflow:hidden;${pinned ? 'background:#0B2E4F;color:#fff' : ''}">
    ${pinned ? `<div class="eyebrow row" style="gap:6px;color:#9EE3EC;padding:14px 16px 0">${icon('pin', 14, '#9EE3EC')}Vastgezet · ${esc(cap(p.category))}</div>` : ''}
    ${isPhotoLeader ? `<div class="eyebrow" style="color:#C93A1F;padding:14px 16px 0">${icon('trophy', 14, '#C93A1F')} Foto van de week</div>` : ''}
    <div class="row" style="padding:14px 16px 0;align-items:flex-start">
      ${avatar(p.author, personName(p.author), 'md')}
      <div style="flex:1;min-width:0">
        <div style="font-size:14px"><strong>${esc(personName(p.author))}</strong> <span style="opacity:.75">· ${esc(cap(p.category))} · ${ago(p.created_at)}</span></div>
        ${p.body ? `<p style="margin-top:4px;font-size:15px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere">${esc(p.body)}</p>` : ''}
      </div>
    </div>
    ${img ? `<img class="post-img" src="${esc(img)}" alt="Foto bij bericht van ${esc(personName(p.author))}" loading="lazy" style="margin-top:12px">` : ''}
    <div class="row" style="gap:2px;padding:4px 8px 6px;flex-wrap:wrap">
      <button class="act" data-act="like" data-id="${p.id}" aria-pressed="${liked}" aria-label="${liked ? 'Vind ik niet meer leuk' : 'Vind ik leuk'}" style="${pinned ? 'color:#fff' : ''}">
        ${icon('heart', 20, pinned ? '#fff' : '#C93A1F', liked ? `fill="${pinned ? '#fff' : '#C93A1F'}"` : '')}${p.likes.length}</button>
      <button class="act" data-act="comments" data-id="${p.id}" style="${pinned ? 'color:#fff' : ''}">${icon('social', 20, pinned ? '#fff' : '#0B2E4F')}${p.comments.length} ${p.comments.length === 1 ? 'reactie' : 'reacties'}</button>
      <span style="flex:1"></span>
      ${me.is_admin ? `<button class="act" data-act="pin" data-id="${p.id}" data-v="${p.pinned}" aria-label="${p.pinned ? 'Losmaken' : 'Vastzetten'}" style="${pinned ? 'color:#fff' : ''}">${icon('pin', 18, pinned ? '#fff' : '#5B6B7C')}</button>` : ''}
      ${canEdit ? `<button class="act" data-act="del" data-id="${p.id}" aria-label="Verwijderen" style="${pinned ? 'color:#fff' : ''}">${icon('trash', 18, pinned ? '#fff' : '#5B6B7C')}</button>` : ''}
    </div>
  </article>`;
}

function highlightCard(h) {
  const li = h.platform === 'linkedin';
  return `<article class="card" style="padding:0;overflow:hidden">
    <div class="row" style="padding:14px 16px 10px">
      <img src="img/logo-navy.png" alt="Overdevest" style="width:74px;height:12px">
      <span style="flex:1"></span>
      <span class="badge ${li ? 'navy' : 'red'}">${li ? 'LinkedIn' : 'Instagram'}</span>
    </div>
    ${h.image_url ? `<img class="post-img" src="${esc(h.image_url)}" alt="Afbeelding bij de ${li ? 'LinkedIn' : 'Instagram'}-post" loading="lazy" style="${li ? '' : 'aspect-ratio:1;max-height:none'}">` : ''}
    <div style="padding:12px 16px 4px">
      ${h.body ? `<p style="font-size:15px;line-height:1.45;white-space:pre-wrap">${esc(h.body)}</p>` : ''}
      <div class="small muted" style="margin-top:4px">${esc(longDate(fromYmd(h.posted_on)))}</div>
    </div>
    ${h.url ? `<div style="padding:2px 8px 8px"><a href="${esc(h.url)}" target="_blank" rel="noopener" class="act" style="text-decoration:none;font-weight:700">
      ${li ? 'Bekijk, like en deel op LinkedIn' : 'Open in Instagram'} ${icon('external', 16)}</a></div>` : ''}
  </article>`;
}

async function commentsSheet(postId, me, done) {
  const list = await q(sb.from('comments').select('*').eq('post_id', postId).order('created_at'));
  const s = sheet(`<form><h2>Reacties</h2>
    <ul class="list" style="max-height:50vh;overflow-y:auto">
      ${list.map(c => `<li style="align-items:flex-start">${avatar(c.author, personName(c.author))}
        <div style="flex:1"><div class="small"><strong>${esc(personName(c.author))}</strong> <span class="muted">· ${ago(c.created_at)}</span></div>
        <p style="font-size:15px;white-space:pre-wrap">${esc(c.body)}</p></div>
        ${c.author === me.id || me.is_admin ? `<button type="button" class="iconbtn" data-del="${c.id}" aria-label="Reactie verwijderen">${icon('trash', 16, '#5B6B7C')}</button>` : ''}</li>`).join('') || '<li class="empty">Nog geen reacties.</li>'}
    </ul>
    <label class="field" for="cm">Jouw reactie</label>
    <textarea class="input" id="cm" name="body" rows="2" required></textarea>
    <button class="btn primary block" type="submit" style="margin-top:12px">Reageren</button>
    <button class="btn ghost block" type="button" data-close style="margin-top:8px">Sluiten</button></form>`,
    async (fd) => { await q(sb.from('comments').insert({ post_id: postId, body: fd.get('body').trim() })); done(); });
  s.el.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del]');
    if (!d) return;
    await q(sb.from('comments').delete().eq('id', d.dataset.del));
    s.close(); done();
  });
}
