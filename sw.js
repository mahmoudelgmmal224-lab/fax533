// sw.js - Service Worker لنظام فاكسات اللواء الجوي 533
const CACHE_NAME = 'fax533-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // إذا كان الطلب للصفحة الرئيسية، أرجع index.html دائماً
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/fax533')) {
    e.respondWith(
      caches.match('./index.html').then(r => r || fetch('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, response.clone());
          return response;
        });
      }).catch(() => caches.match('./index.html'));
    })
  );
});
