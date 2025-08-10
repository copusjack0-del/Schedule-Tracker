const CACHE = 'pocket-schedulepay-v2';
const ASSETS = ['./','index.html','styles.css','app.js','manifest.json','icons/icon-192.png','icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const { request } = e; if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(res => res || fetch(request).then(net => {
      const copy = net.clone(); caches.open(CACHE).then(c=>c.put(request, copy)).catch(()=>{});
      return net;
    }).catch(()=>caches.match('./')))
  );
});
