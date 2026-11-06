/* Zhala service worker: caches the app shell for offline launch. Never caches API calls or team data. */
const CACHE = 'zhala-v1.0.1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'apple-touch-icon.png', 'icon-180.png', 'icon-512.png', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;     // Alibaba, Open-Meteo: straight to network
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname) || url.pathname.includes('/samples/')) return;  // team data.json and audio: network only
  // Network first so updates land quickly; fall back to cache when offline.
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
