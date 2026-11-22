/* Frame Sense service worker: app-shell cache so the app opens offline.
   Photos and projects live in IndexedDB on the device, not in this cache. */
const CACHE = "framesense-v1.6.0";
/* AI engine files (mediapipe bundle/wasm/model, ~10 MB) live in a separate cache
   that survives app-shell updates, so users keep the engine they approved. */
const AI_CACHE = "framesense-ai";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  // bypass HTTP cache: a stale cached shell must never poison a new version's cache
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((a) =>
        fetch(a, { cache: "no-cache" }).then((r) => cache.put(a, r))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AI_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const bucket = /mediapipe|tasks-vision|googleapis|huggingface|hf\.co|onnxruntime|jsdelivr|/raw/.test(event.request.url) ? AI_CACHE : CACHE;
  // app shell (navigations / html): network-first so updates actually reach users, cache as offline fallback
  const isShell = event.request.mode === "navigate" || /\/(index\.html)?$/.test(new URL(event.request.url).pathname);
  if (isShell) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
        return response;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(
    caches.open(bucket).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
    )
  );
});
