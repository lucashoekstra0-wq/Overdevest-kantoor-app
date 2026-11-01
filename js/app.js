import { sb, q, configured, loadPeople, personName } from './sb.js';
import { ALLOWED_DOMAIN } from './config.js';
import { esc, icon, initials, colorIndex, toast } from './ui.js';

const app = document.getElementById('app');

const ROUTES = {
  home:      { tab: 'home',      load: () => import('./pages/home.js') },
  lunch:     { tab: 'lunch',     load: () => import('./pages/lunch.js') },
  agenda:    { tab: 'agenda',    load: () => import('./pages/agenda.js') },
  social:    { tab: 'social',    load: () => import('./pages/social.js') },
  werknemer: { tab: 'werknemer', load: () => import('./pages/werknemer.js') },
  koffie:    { tab: 'home', sub: 'Koffie aanvragen', load: () => import('./pages/koffie.js') },
  profiel:   { tab: null,   sub: 'Mijn profiel',     load: () => import('./pages/profiel.js') },
  beheer:    { tab: null,   sub: 'Beheer',           load: () => import('./pages/beheer.js'), admin: true }
};

const TABS = [
  ['home', 'Home', 'home'],
  ['lunch', 'Lunch', 'lunch'],
  ['agenda', 'Agenda', 'agenda'],
  ['social', 'Social', 'social'],
  ['werknemer', 'Werknemer', 'trophy']
];

const ctx = {
  me: null,
  go: (route) => { location.hash = '#/' + route; },
  refresh: () => render(),
  pendingCoffee: 0
};

// ------------------------------------------------------------------
//  Start
// ------------------------------------------------------------------
async function start() {
  if (!configured) {
    app.innerHTML = `<div class="login"><div class="hero">
      <img src="img/logo-white.png" alt="Overdevest" style="height:18px;width:112px">
      <div class="big" style="font-size:32px;margin-top:16px">Bijna klaar</div>
      <p style="margin-top:8px">Vul je Supabase-gegevens in <code>js/config.js</code> in. Zie README.md voor de stappen.</p>
    </div></div>`;
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_IN' && !ctx.me) boot(s);
    if (event === 'SIGNED_OUT') { ctx.me = null; showLogin(); }
  });
  if (session) await boot(session); else showLogin();
}

async function boot(session) {
  try {
    const me = await q(sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
    if (!me) throw new Error('Je account is nog niet compleet. Neem contact op met Lucas of Dennis.');
    if (!me.active) throw new Error('Je account is gedeactiveerd.');
    ctx.me = me;
    await loadPeople();
    if (location.hash.includes('access_token') || !location.hash.startsWith('#/')) history.replaceState(null, '', '#/home');
    listenRealtime();
    render();
  } catch (e) {
    app.innerHTML = `<div class="login"><div class="card"><h2>Er ging iets mis</h2><p class="muted" style="margin-top:6px">${esc(e.message)}</p>
      <button class="btn navy block" style="margin-top:16px" id="logout">Uitloggen</button></div></div>`;
    document.getElementById('logout').onclick = () => sb.auth.signOut();
  }
}

// ------------------------------------------------------------------
//  Inloggen met code of link per e-mail
// ------------------------------------------------------------------
function showLogin(step = 'email', email = '') {
  app.innerHTML = `
    <div class="login">
      <div class="hero" style="margin-bottom:16px">
        <span class="ring" aria-hidden="true" style="right:-40px;top:-46px;width:140px;height:156px;border-width:20px;border-color:#E5482D;border-radius:38px"></span>
        <span class="ring" aria-hidden="true" style="right:-26px;bottom:-60px;width:90px;height:100px;border-width:14px;border-color:#0FA3B8;border-radius:28px"></span>
        <img src="img/logo-white.png" alt="Overdevest" style="height:20px;width:124px;display:block">
        <div class="big" style="font-size:36px;margin-top:22px;max-width:230px">Welkom bij de Overdevest App</div>
        <p style="margin-top:8px;opacity:.85;max-width:240px">Lunch, koffie, agenda en alles wat er op kantoor speelt.</p>
      </div>
      <form class="card" id="loginForm">
        ${step === 'email' ? `
          <label class="field" for="email" style="margin-top:0">Je werk-e-mailadres</label>
          <input class="input" id="email" name="email" type="email" autocomplete="email" required placeholder="naam@${esc(ALLOWED_DOMAIN)}" value="${esc(email)}">
          <button class="btn primary block" type="submit" style="margin-top:14px">Stuur mij een inlogcode</button>
          <p class="small muted" style="margin-top:10px">Geen wachtwoord nodig. Je krijgt een code per e-mail.</p>
        ` : `
          <p style="font-size:15px">We hebben een code gestuurd naar <strong>${esc(email)}</strong>.</p>
          <label class="field" for="code">Inlogcode uit de e-mail</label>
          <input class="input" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="10" placeholder="123456" style="font-size:24px;letter-spacing:.2em;text-align:center">
          <button class="btn primary block" type="submit" style="margin-top:14px">Inloggen</button>
          <button class="linkbtn" type="button" id="again" style="margin-top:6px">Ander e-mailadres of opnieuw sturen</button>
          <p class="small muted" style="margin-top:6px">Kreeg je een link? Tik erop op dit apparaat, dat werkt ook.</p>
        `}
      </form>
    </div>`;

  const form = document.getElementById('loginForm');
  document.getElementById('again')?.addEventListener('click', () => showLogin('email', email));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (step === 'email') {
        const addr = form.email.value.trim().toLowerCase();
        if (ALLOWED_DOMAIN && !addr.endsWith('@' + ALLOWED_DOMAIN)) throw new Error(`Gebruik je @${ALLOWED_DOMAIN}-adres.`);
        const { error } = await sb.auth.signInWithOtp({
          email: addr,
          options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname }
        });
        if (error) throw new Error(error.message.includes('Database error') ? 'Dit e-mailadres heeft geen toegang.' : error.message);
        showLogin('code', addr);
      } else {
        const { error } = await sb.auth.verifyOtp({ email, token: form.code.value.trim(), type: 'email' });
        if (error) throw new Error('Die code klopt niet of is verlopen.');
      }
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  });
}

// ------------------------------------------------------------------
//  Router en schermopbouw
// ------------------------------------------------------------------
window.addEventListener('hashchange', () => ctx.me && render());

async function render() {
  const name = (location.hash.replace('#/', '').split('?')[0]) || 'home';
  const route = ROUTES[name] || ROUTES.home;
  if (route.admin && !ctx.me.is_admin) return ctx.go('home');

  const me = ctx.me;
  const top = route.sub
    ? `<header class="topbar sub">
         <a class="iconbtn" href="#/home" aria-label="Terug">${icon('back', 24)}</a>
         <span class="title">${esc(route.sub)}</span>
       </header>`
    : `<header class="topbar">
         <img class="logo" src="img/logo-navy.png" alt="Overdevest">
         <div class="row" style="gap:2px">
           <a class="iconbtn" href="#/koffie" aria-label="Koffieverzoeken${ctx.pendingCoffee ? ', ' + ctx.pendingCoffee + ' open' : ''}">
             ${icon('coffee', 22)}${ctx.pendingCoffee ? '<span class="dot"></span>' : ''}</a>
           <a class="iconbtn" href="#/profiel" aria-label="Mijn profiel"><span class="avatar c${colorIndex(me.id)}">${esc(initials(me.full_name))}</span></a>
         </div>
       </header>`;

  const tabs = `<nav class="tabbar" aria-label="Hoofdmenu">${TABS.map(([r, label, ic]) =>
    `<a href="#/${r}" class="tab ${route.tab === r ? 'on' : ''}" ${route.tab === r ? 'aria-current="page"' : ''}><span class="ic">${icon(ic, 22)}</span>${label}</a>`).join('')}</nav>`;

  app.innerHTML = `${top}<main class="page" id="page"><div class="loading">Laden…</div></main>${tabs}`;
  window.scrollTo(0, 0);
  const el = document.getElementById('page');
  try {
    const mod = await route.load();
    await mod.render(el, ctx);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="section card"><h2>Kon niet laden</h2><p class="muted" style="margin-top:6px">${esc(e.message)}</p>
      <button class="btn navy" style="margin-top:12px" onclick="location.reload()">Opnieuw proberen</button></div>`;
  }
}

// ------------------------------------------------------------------
//  Live meldingen in de app (koffie)
// ------------------------------------------------------------------
async function countCoffee() {
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { count } = await sb.from('coffee_requests').select('id', { count: 'exact', head: true }).eq('status', 'nieuw').gte('created_at', since);
  ctx.pendingCoffee = count || 0;
}

function listenRealtime() {
  countCoffee();
  sb.channel('kantoor')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'coffee_requests' }, async ({ new: r }) => {
      await countCoffee();
      if (r.requester !== ctx.me.id) showCoffeeNotice(r);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'coffee_requests' }, async ({ new: r }) => {
      await countCoffee();
      if (r.requester === ctx.me.id && r.handler && r.handler !== ctx.me.id) {
        const msg = { geaccepteerd: `${personName(r.handler)} pakt je koffie op`, onderweg: `${personName(r.handler)} komt eraan met de koffie`, gebracht: 'Je koffie is gebracht. Geniet ervan!' }[r.status];
        if (msg) toast(msg);
      }
      if (location.hash.startsWith('#/koffie')) render();
    })
    .subscribe();
}

function showCoffeeNotice(r) {
  const n = Object.values(r.items || {}).reduce((a, b) => a + Number(b), 0);
  const box = document.createElement('div');
  box.className = 'notice';
  box.innerHTML = `<div class="card" role="alert" style="box-shadow:0 10px 30px rgba(11,46,79,.25);display:flex;gap:12px;align-items:center">
      <span class="avatar md c0">${icon('coffee', 20, '#0B2E4F')}</span>
      <div style="flex:1"><strong>${esc(personName(r.requester))} vraagt ${n} drankjes</strong><div class="small muted">Wie pakt het op?</div></div>
      <a class="btn primary sm" href="#/koffie">Bekijk</a>
    </div>`;
  document.body.appendChild(box);
  box.querySelector('a').addEventListener('click', () => box.remove());
  setTimeout(() => box.remove(), 12000);
}

start();
