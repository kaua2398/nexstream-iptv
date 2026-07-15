const CACHE = 'nexstream-shell-v1';
const SHELL = ['/login', '/dashboard', '/icons/icon-192.svg', '/icons/icon-512.svg'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/v1/playback') || url.pathname.startsWith('/api/v1/auth')) return;
  if (request.destination === 'image' && url.origin === self.location.origin) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; });
      return cached || network;
    }));
  }
});
