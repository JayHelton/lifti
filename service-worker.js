const CACHE_VERSION = "v6";
const CACHE_NAME = `lifti-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "db.js",
  "ui.js",
  "programs.js",
  "manifest.webmanifest",
  "favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, network.clone()).catch(() => {});
          return network;
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match("index.html")) ||
            (await cache.match("./")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  if (!sameOrigin) return;

  const isAppShell =
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "manifest" ||
    url.pathname.endsWith(".html");

  if (isAppShell) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const network = await fetch(new Request(request, { cache: "reload" }));
          if (network && network.ok) cache.put(request, network.clone()).catch(() => {});
          return network;
        } catch (error) {
          return (await cache.match(request)) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const network = await fetch(request);
        if (network && network.ok) cache.put(request, network.clone()).catch(() => {});
        return network;
      } catch (error) {
        return cached || Response.error();
      }
    })()
  );
});
