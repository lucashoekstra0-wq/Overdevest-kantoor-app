import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const key = new URLSearchParams(location.search).get('key') || '';
const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// ---- Schaal 1920x1080 naar elk scherm ----
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  const st = $('stage');
  st.style.transform = `scale(${s})`;
  st.style.left = `${(innerWidth - 1920 * s) / 2}px`;
  st.style.top = `${(innerHeight - 1080 * s) / 2}px`;
}
addEventListener('resize', fit); fit();

// ---- Klok ----
function clock() {
  const n = new Date();
  $('clock').textContent = hm(n);
  const d = n.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  $('date').textContent = d.charAt(0).toUpperCase() + d.slice(1);
  const h = n.getHours();
  $('greet').textContent = h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
}
setInterval(clock, 1000); clock();

// ---- Gegevens uit de app ----
let data = null, slides = [], slideIdx = 0, socialIdx = 0;

async function loadFeed() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tv_feed`, { method: 'POST', headers, body: JSON.stringify({ k: key }) });
    if (!r.ok) throw new Error(r.status === 400 || r.status === 404 ? 'Ongeldige of verlopen TV-link. Vraag een nieuwe link aan via Beheer > TV-scherm.' : 'Geen verbinding');
    data = await r.json();
    $('error').style.display = 'none';
    paint();
  } catch (e) {
    if (!data) { $('error').style.display = 'flex'; $('error').textContent = e.message; }
  }
}

function paint() {
  const d = data;
  // Lunch
  $('tafel').textContent = d.duties?.tafel ? `${d.duties.tafel.split(' ')[0]} dekt` : 'Wordt nog geloot';
  $('lunchinfo').textContent = d.snack_day
    ? (d.duties?.airfryer ? `Airfryer: ${d.duties.airfryer.split(' ')[0]} · ` : '') + `${d.lunch_count} eten mee`
    : `${d.lunch_count} collega's eten mee`;

  // Ruimtes
  const now = Date.now();
  $('rooms').innerHTML = (d.rooms || []).map(r => {
    const busy = r.busy_until && new Date(r.busy_until) > now;
    const status = busy ? `bezet tot ${hm(r.busy_until)}` : r.next_start ? `vrij tot ${hm(r.next_start)}` : 'vrij';
    return `<li class="room"><span class="dot" style="background:${busy ? '#E5482D' : '#0FA3B8'}"></span>
      <span style="flex:1;font-size:26px;font-weight:700">${esc(r.name)}</span>
      <span style="font-size:22px;color:${busy ? '#C9D7E4' : '#9EE3EC'}">${status}</span></li>`;
  }).join('');

  // Vandaag
  const agenda = [];
  if (d.lunch_count) agenda.push(['12:30', 'Gezamenlijke lunch']);
  (d.agenda || []).forEach(a => agenda.push([hm(a.time), a.title + (a.location ? ` · ${a.location}` : '')]));
  (d.birthdays || []).filter(b => b.date === d.today).forEach(b => agenda.unshift(['Hoera', `${b.name} is jarig!`]));
  $('agenda').innerHTML = agenda.length
    ? agenda.slice(0, 5).map(([t, s]) => `<li style="display:flex;gap:16px;font-size:24px"><strong style="width:76px;color:#9EE3EC;flex-shrink:0">${esc(t)}</strong><span>${esc(s)}</span></li>`).join('')
    : '<li class="muted" style="font-size:24px">Geen bijzonderheden</li>';

  // Werknemer van de week
  const w = d.last_winner;
  $('winner').innerHTML = w ? `<div style="display:flex;align-items:center;gap:18px;margin-top:16px;padding:14px 18px;background:#0B2E4F;border-radius:20px">
      <span style="width:56px;height:56px;border-radius:28px;background:#FFC857;color:#0B2E4F;font:800 28px 'Saira Condensed';display:flex;align-items:center;justify-content:center;flex-shrink:0">1</span>
      <span style="flex:1"><strong class="display" style="display:block;font-size:44px;line-height:1">${esc(w.name.split(' ')[0])}</strong>
      <span class="muted" style="font-size:22px">${w.votes} nominatie${w.votes === 1 ? '' : 's'} vorige week</span></span>
      <svg width="44" height="44" viewBox="0 0 24 24" fill="#FFC857" stroke="#FFC857" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M2 8l5 4 5-7 5 7 5-4-2 11H4z"/></svg></div>`
    : `<div class="muted" style="font-size:24px;margin-top:14px">Nomineer een collega in de app!</div>`;
  const medal = ['#FFC857', '#C9D2DC', '#E9A27A'];
  $('ranking').innerHTML = (d.ranking || []).slice(0, 4).map((r, i) => `<li class="rank">
      <span class="badge" style="${i < 3 ? `background:${medal[i]};color:#0B2E4F` : ''}">${i + 1}</span>
      <span style="flex:1;font-size:28px;font-weight:600">${esc(r.name)}</span>
      <span style="font-size:24px;font-weight:700;color:#9EE3EC">${r.votes}</span></li>`).join('')
    || '<li class="muted" style="font-size:22px">Deze week nog geen nominaties</li>';
  if ((d.ranking || []).length) $('ranking').insertAdjacentHTML('beforebegin', '');

  buildSlides();
  paintSocial();
}

// ---- Volg Overdevest (wisselt LinkedIn / Instagram) ----
function paintSocial() {
  const list = data?.social || [];
  const el = $('socialcard');
  if (!list.length) {
    el.innerHTML = `<div class="eyebrow" style="color:#0B7285">Volg Overdevest</div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px;font-size:30px;font-weight:600">
        <span>Volg ons op LinkedIn en Instagram</span><span style="font-size:22px;color:#4A5A6B">Beheerders voegen de nieuwste post toe via Beheer</span></div>`;
    return;
  }
  const p = list[socialIdx % list.length];
  const li = p.platform === 'linkedin';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="eyebrow" style="color:#0B7285">Volg Overdevest</div>
      <span style="font-size:20px;font-weight:700;color:#fff;border-radius:14px;padding:6px 14px;background:${li ? '#0B2E4F' : '#C93A1F'}">${li ? 'LinkedIn' : 'Instagram'}</span>
    </div>
    ${p.image_url ? `<img src="${esc(p.image_url)}" alt="" style="flex:1;min-height:0;width:100%;object-fit:cover;margin-top:14px;border-radius:18px">`
      : `<div class="placeholder" style="flex:1;min-height:0;margin-top:14px;border-radius:18px">${li ? 'LinkedIn' : 'Instagram'}</div>`}
    <div style="font-size:26px;font-weight:600;line-height:1.3;margin-top:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.body || '')}</div>`;
}

// ---- Spotlight ----
function buildSlides() {
  const d = data;
  slides = [];
  if (d.snack_day) {
    const totals = Object.entries(d.snack_totals || {}).map(([k, v]) => `${v}× ${k.toLowerCase()}`).join(' · ');
    slides.push(`<div class="slide" style="background:#C93A1F">
      <span class="ring" style="right:-80px;top:-90px;width:380px;height:420px;border-width:56px;border-color:#0B2E4F;border-radius:96px"></span>
      <span class="ring" style="right:220px;bottom:-120px;width:200px;height:220px;border-width:36px;border-color:#FFB4A6;border-radius:56px"></span>
      <div class="eyebrow" style="position:relative;color:#fff">${esc(new Date().toLocaleDateString('nl-NL', { weekday: 'long' }))} · airfryer-lunch</div>
      <div class="big" style="position:relative">Kroket of<br>frikandel?</div>
      <div class="sub" style="position:relative">${totals ? esc(totals) : `Bestel in de app vóór ${esc(d.lunch_deadline)}`}</div></div>`);
  }
  (d.birthdays || []).slice(0, 2).forEach(b => {
    const today = b.date === d.today;
    slides.push(`<div class="slide" style="background:#0FA3B8;color:#0B2E4F">
      <span class="ring" style="right:-60px;top:-80px;width:360px;height:400px;border-width:56px;border-color:#fff;border-radius:96px;opacity:.6"></span>
      <div class="eyebrow" style="position:relative;color:#0B2E4F">Hoera!</div>
      <div class="big" style="position:relative">${esc(b.name.split(' ')[0])} is<br>${today ? 'vandaag' : 'binnenkort'} jarig</div>
      <div class="sub" style="position:relative">Feliciteer in de app</div></div>`);
  });
  if (d.next_activity) {
    const a = d.next_activity, t = new Date(a.time);
    const day = t.toLocaleDateString('nl-NL', { weekday: 'long' });
    slides.push(`<div class="slide" style="background:#123A60">
      <span style="position:absolute;right:150px;top:-10px;width:56px;height:170px;background:#0FA3B8;transform:skewX(22deg);transform-origin:bottom"></span>
      <span style="position:absolute;right:230px;top:-10px;width:56px;height:170px;background:#E5482D;transform:skewX(-22deg);transform-origin:bottom"></span>
      <span class="ring" style="right:70px;top:150px;width:290px;height:330px;border-width:56px;border-color:#E5482D;border-radius:72px"></span>
      <div class="eyebrow" style="position:relative">${esc(day)} ${hm(t)}${a.location ? ' · ' + esc(a.location) : ''}</div>
      <div class="big" style="position:relative;max-width:900px">${esc(a.title)}</div>
      <div class="sub muted" style="position:relative">${a.going} aanmelding${a.going === 1 ? '' : 'en'} · meld je aan via Agenda</div></div>`);
  }
  if (d.photo_of_week) {
    const p = d.photo_of_week;
    slides.push(`<div class="slide" style="background:#fff;color:#0B2E4F">
      <span class="ring" style="right:-60px;top:-70px;width:300px;height:330px;border-width:48px;border-color:#E5482D;border-radius:80px"></span>
      <div class="eyebrow" style="position:relative;color:#C93A1F">Foto van de week</div>
      <div class="big" style="position:relative">${esc(p.name.split(' ')[0])}</div>
      <div class="sub" style="position:relative;color:#4A5A6B">${esc((p.body || '').slice(0, 90))} · ${p.likes} likes · bekijk in de app</div></div>`);
  }
  if (!slides.length) {
    slides.push(`<div class="slide" style="background:#123A60">
      <span class="ring" style="right:-80px;top:-90px;width:380px;height:420px;border-width:56px;border-color:#E5482D;border-radius:96px"></span>
      <div class="eyebrow" style="position:relative">Overdevest App</div>
      <div class="big" style="position:relative">Bestel, boek<br>en deel</div>
      <div class="sub muted" style="position:relative">Alles voor kantoor in één app op je telefoon</div></div>`);
  }
  slideIdx = slideIdx % slides.length;
  showSlide();
}

function showSlide() {
  $('slide').innerHTML = slides[slideIdx];
  $('dots').innerHTML = slides.map((_, i) => `<div class="${i === slideIdx ? 'on' : ''}"></div>`).join('');
}

setInterval(() => {
  if (!slides.length) return;
  slideIdx = (slideIdx + 1) % slides.length;
  socialIdx++;
  showSlide();
  paintSocial();
}, 12000);

// ---- NOS-nieuws via de Supabase-functie "nos" ----
async function loadNews() {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/nos`, { headers });
    if (!r.ok) throw new Error();
    const items = await r.json();
    if (!items.length) throw new Error();
    const html = items.slice(0, 12).map(i => `<span><strong style="color:#C93A1F">${hm(i.date)}</strong> ${esc(i.title)}</span>`).join('');
    const t = $('ticker');
    t.innerHTML = html + html;
    t.style.setProperty('--dur', `${Math.max(60, items.length * 9)}s`);
  } catch {
    $('ticker').innerHTML = '<span>Het laatste nieuws lees je op nos.nl</span><span>Het laatste nieuws lees je op nos.nl</span>';
  }
}

loadFeed(); loadNews();
setInterval(loadFeed, 60 * 1000);
setInterval(loadNews, 5 * 60 * 1000);
// Elke nacht verversen zodat nieuwe versies van de pagina geladen worden
setInterval(() => { if (new Date().getHours() === 4 && new Date().getMinutes() === 0) location.reload(); }, 60 * 1000);
