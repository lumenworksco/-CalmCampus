// Offline shell. Same-origin only: this worker never makes a request to anyone else.
// Cache storage is shared by the whole origin, so every university folder owns a prefix
// and only ever deletes its own old caches.
const PREFIX = "calmcampus-__ID__-";
const CACHE = `${PREFIX}__BUILD__`;
const SHELL = __SHELL__;

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache. The host may let browsers keep files
  // for hours, and without this a new version could be filled with the old files.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })).catch(() => caches.match("index.html")),
  );
});
