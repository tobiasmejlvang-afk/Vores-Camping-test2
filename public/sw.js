const CACHE_PREFIX = 'vores-camping-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v31.0.3-20260823-2`;
const APP_SHELL = ['/', '/app-icon.webp', '/icon-512.png', '/vores-camping-logo.webp', '/og.png', '/sisi-vagten.png', '/sisi-guiden.png', '/misser-grafikeren.png', '/misser-meteorologen.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    const shellResponse = await fetch('/');
    if (shellResponse.ok) {
      const html = await shellResponse.clone().text();
      await cache.put('/', shellResponse);
      const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => match[1])
        .filter((path) => path.startsWith('/') && !path.startsWith('/api/'));
      await Promise.all([...new Set(assetPaths)].map((path) => cache.add(path).catch(() => undefined)));
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const managedCaches = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX)).sort().reverse();
    await Promise.all(managedCaches.slice(3).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
