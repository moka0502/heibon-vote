const CACHE_NAME = 'heibon-vote-shell-v22';
const SHELL_ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/api.js',
  'js/app.js',
  'js/render.js',
  'js/storage.js',
  'js/effects.js',
  'js/native.js',
  'js/register-sw.js',
  'js/vendor/gsap.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // データは常に最新である必要があるため、API呼び出しはキャッシュせずそのままネットワークへ通す
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
