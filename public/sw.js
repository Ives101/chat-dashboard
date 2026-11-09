const CACHE_NAME = "chat-dashboard-v2";
const STATIC_ASSETS = ["/", "/manifest.json"];

// API routes to cache for offline viewing
const CACHEABLE_API = ["/api/chats", "/api/folders", "/api/export"];

self.addEventListener("install", (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event: any) => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  // Don't cache non-GET or non-same-origin
  if (method !== "GET" || url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cacheable API routes: stale-while-revalidate
  if (CACHEABLE_API.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached ?? new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }));
        return cached ?? fetchPromise;
      })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match("/"));
    })
  );
});

// Handle sync messages from the client
self.addEventListener("message", (event: any) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CLEAR_CACHE") {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});