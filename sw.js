// Service worker: laat de app snel openen; gegevens komen altijd live uit Supabase.
const VERSION = 'overdevest-v1';
const SHELL = ['./', './index.html', './css/app.css', './js/app.js', './js/ui.js', './js/sb.js', './js/config.js',
  './img/logo-navy.png', './img/logo-white.png', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Eigen bestanden: eerst netwerk (altijd de nieuwste versie), bij geen verbinding de opgeslagen versie.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
