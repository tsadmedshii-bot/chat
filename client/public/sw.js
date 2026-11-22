// Чат — service worker (PWA).
// Стратеги: navigation болон /api хүсэлтийг үргэлж сүлжээнээс авна
// (хуучирсан өгөгдөл хэзээ ч үзүүлэхгүй), статик файлуудыг (JS/CSS/зураг)
// кэшээс авч, байхгүй бол сүлжээнээс аваад кэшилнэ.
// Шинэ хувилбар гарсан үед хуучин кэшийг устгаж, шууд идэвхждэг.
const CACHE_NAME = 'chat-v1';
const CORE_ASSETS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation болон API: сүлжээнээс, бүтэлгүйтвэл кэшлэгдсэн нүүр хуудсыг.
  if (request.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/')),
    );
    return;
  }

  // Статик asset: кэшээс, байхгүй бол сүлжээнээс аваад кэшилнэ.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      });
    }),
  );
});
