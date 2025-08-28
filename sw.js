const CACHE_NAME = 'opticrane-pwa-v1_2';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest.json','./opticrane-icon-192.png','./opticrane-icon-512.png'];

self.addEventListener('install',(e)=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',(e)=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):null))))});
self.addEventListener('fetch',(e)=>{
  const url=new URL(e.request.url);
  if(ASSETS.includes(url.pathname.replace(self.registration.scope,'./'))){e.respondWith(caches.match(e.request));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('./index.html'))));
});
