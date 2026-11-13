// Simple Streamer PWA Service Worker
const CACHE_NAME = 'simple-streamer-v2';
const ASSETS = [
  '/remote',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Never intercept WebSocket, bridge configs, or dynamic auth challenges
  if (url.includes(':4455') || url.includes('/auth-challenge') || url.includes('/remote-config')) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
