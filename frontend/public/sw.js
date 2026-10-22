/* global self, caches */
/* RenderPro service worker (2026-10-20, owner: PWA for every device).
 *
 * What it does, and above all what it never does:
 *  - it makes the app installable and shows a calm offline page when the
 *    network is gone;
 *  - it keeps the site's own static files (hashed Next chunks, the icons, a
 *    few public pictures) so the shell opens fast;
 *  - it NEVER stores pages, API answers or anyone's images: an account's
 *    renders, credits and sheets are private and must always come from the
 *    server. Non-GET requests, other origins and /api/ are not touched at all.
 * Change VERSION to retire every cache at the next visit. */
const VERSION = 'rp-v1';
const STATIC = VERSION + '-static';
const IMAGES = VERSION + '-images';
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/pwa/icon-192.png', '/pwa/icon-512.png'];
const MAX_IMAGES = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.indexOf('rp-') === 0 && k.indexOf(VERSION) !== 0)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(pathname) {
  return pathname.indexOf('/_next/static/') === 0 || pathname.indexOf('/pwa/') === 0;
}

/* Public pictures of the site itself (never /api/, which holds the user's). */
function isSitePicture(request, pathname) {
  return (
    request.destination === 'image' &&
    pathname.indexOf('/api/') !== 0 &&
    (pathname.indexOf('/brand/') === 0 ||
      pathname.indexOf('/rail/') === 0 ||
      pathname.indexOf('/presets/') === 0 ||
      pathname.indexOf('/modeles/') === 0)
  );
}

function cacheFirst(request, name) {
  return caches.open(name).then((cache) =>
    cache.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        }),
    ),
  );
}

function staleWhileRevalidate(request, name) {
  return caches.open(name).then((cache) =>
    cache.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            cache.put(request, res.clone());
            cache.keys().then((keys) => {
              if (keys.length > MAX_IMAGES) cache.delete(keys[0]);
            });
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.indexOf('/api/') === 0 || path === '/sw.js') return;

  if (request.mode === 'navigate') {
    // Always the server; the offline page only when it cannot be reached.
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((res) => res || Response.error())),
    );
    return;
  }
  if (isStaticAsset(path)) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (isSitePicture(request, path)) {
    event.respondWith(staleWhileRevalidate(request, IMAGES));
  }
});
