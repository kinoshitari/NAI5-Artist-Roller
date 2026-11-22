/* Build replaces the following placeholders with content hashes and local assets. */
const VERSION = __CACHE_VERSION__;
const FILES = __PRECACHE_FILES__;
const SCOPE = new URL(self.registration.scope);
const PREFIX = `nai5-artist-roller:${SCOPE.pathname}:`;
const CACHE = PREFIX + VERSION;
const URLS = FILES.map(file => new URL(file, SCOPE).href);
const OWN = new Set(URLS);

self.addEventListener('install', event => {
  // addAll is atomic: an interrupted download does not replace a working version.
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(URLS.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'OFFLINE_STATUS') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const complete = (await Promise.all(URLS.map(url => cache.match(url)))).every(Boolean);
      event.ports?.[0]?.postMessage({ ready: complete, version: VERSION });
    })());
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE.origin) return;
  // Never intercept API requests, arbitrary source URLs, or another repository.
  const entry = url.pathname === SCOPE.pathname || url.pathname === new URL('index.html', SCOPE).pathname;
  if (event.request.mode === 'navigate' && entry) {
    event.respondWith(caches.open(CACHE).then(async cache =>
      (await cache.match(new URL('index.html', SCOPE).href)) || fetch(event.request)));
    return;
  }
  if (!OWN.has(url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache =>
    (await cache.match(event.request)) || fetch(event.request)));
});
