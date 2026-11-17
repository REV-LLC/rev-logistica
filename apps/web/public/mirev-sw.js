const CACHE_PREFIX = 'mirev-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/mirev-offline.html';
const PRECACHE = [OFFLINE_URL, '/fiesta.svg', '/mirev-icon-192.png', '/mirev-icon-512.png', '/mirev-apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  // MiREV never deletes REV Logística caches or changes its registration.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Attendance requires the live server; never cache personal pages or punches.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  } else if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
