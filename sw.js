// Offline support: cache the app shell, serve cache-first, refresh in the background.
const CACHE = 'pulseforge-v2';
const ASSETS = [
  './', './index.html', './app.html', './css/style.css', './css/site.css', './js/site.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './js/app.js', './js/state.js',
  './js/audio/engine.js', './js/audio/instruments.js', './js/audio/effects.js', './js/audio/samples.js',
  './js/ui/windows.js', './js/ui/widgets.js', './js/ui/rack.js', './js/ui/pianoroll.js', './js/ui/playlist.js',
  './js/ui/mixer.js', './js/ui/browser.js', './js/ui/editor.js', './js/ui/guide.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const network = fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  }));
});
