// Mail Mantis service worker: lets the dashboard install as an app and open offline.
// Network first, so a deploy is picked up straight away; the cache is only a fallback.
// API calls and OAuth callbacks are never cached.
const CACHE = 'mail-mantis-v1';
const SHELL = ['/', '/app.js', '/app.css', '/manifest.webmanifest', '/assets/icon.svg', '/assets/icon-192.png', '/assets/fonts/Geist-Variable.woff2'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request.mode === 'navigate' ? '/' : request, copy));
    }
    return response;
  }).catch(() => caches.match(request.mode === 'navigate' ? '/' : request).then(hit => hit || Response.error())));
});
