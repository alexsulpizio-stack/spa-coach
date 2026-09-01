importScripts('../lib/version.js');
const { APP_VERSION } = globalThis.SpaVersion;
const CACHE_NAME = `strip-reader-phone-v${APP_VERSION}`;

const ASSETS = [
  './', './index.html', './app.js', './manifest.webmanifest',
  '../styles.css', '../lib/version.js', '../lib/photo-store.js', '../lib/native-bridge.js',
  '../lib/scanner.js', '../lib/scan-session.js', '../lib/chemistry.js',
  '../icon-192.png', '../icon-512.png', '../apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(c => c || caches.match('./index.html'))));
});
