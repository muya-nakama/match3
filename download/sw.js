const CACHE_NAME = "monpatch-download-2.62.0";
const APP_FILES = [
  "./",
  "./index.html",
  "./game.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./pwa.js",
  "./version.json",
  "./js/app.js",
  "./js/bootstrap.js",
  "./js/game-core.js",
  "./js/game-ui.js",
  "./js/multi.js",
  "./js/profile.js",
  "./js/single.js",
  "./js/tutorial.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith("monpatch-download-") && name !== CACHE_NAME).map(name => caches.delete(name))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
