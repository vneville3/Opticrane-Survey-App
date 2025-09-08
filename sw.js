// Opticrane PWA Service Worker v1.3.0
const CACHE_NAME = 'opticrane-pwa-v1_3_0';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=1.3.0',
  './app.js?v=1.3.0',
  './manifest.json?v=1.3.0',
  './opticrane-icon-192.png',
  './opticrane-icon-512.png'
];
self.addEventListener('install', e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate', e=>{ e.waitUntil((async()=>{ const keys=await caches.keys(); await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))); await self.clients.claim(); })()); });
self.addEventListener('fetch', e=>{ if(e.request.mode==='navigate'){ e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html'))); return; } e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))); });
