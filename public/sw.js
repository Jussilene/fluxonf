self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-first simples para cumprir requisito de PWA instalável.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
