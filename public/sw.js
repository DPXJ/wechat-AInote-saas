self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Keep requests network-first. The service worker exists to make the app installable
  // without interfering with authenticated API responses or fresh attachment previews.
});
