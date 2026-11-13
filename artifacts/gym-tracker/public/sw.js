/*
 * Service worker: keeps the app shell (index.html and its hashed assets) so the
 * app opens without a connection. It never touches /api, /mcp or the OAuth
 * metadata; data always comes from the network.
 */
const CACHE = "gym-shell-v1";
const SCOPE = new URL(self.registration.scope);
const INDEX_KEY = new URL("index.html", SCOPE).href;
const ASSETS_PATH = new URL("assets/", SCOPE).pathname;
const NETWORK_ONLY = ["api/", "mcp", ".well-known/"].map((p) => new URL(p, SCOPE).pathname);

/** Same-origin script, style and icon URLs that index.html points at. */
function shellUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], SCOPE);
    if (url.origin !== SCOPE.origin) continue;
    if (url.pathname.startsWith(ASSETS_PATH) || /\.(svg|png|webmanifest)$/.test(url.pathname)) urls.add(url.href);
  }
  return [...urls];
}

function cacheable(response) {
  return response.ok && !(response.headers.get("content-type") ?? "").includes("text/html");
}

/** Stores a fresh index.html, fetches what it needs and drops assets of older builds. */
async function storeShell(response) {
  const cache = await caches.open(CACHE);
  const wanted = shellUrls(await response.clone().text());
  await cache.put(INDEX_KEY, response);
  await Promise.all(
    wanted.map(async (url) => {
      if (await cache.match(url)) return;
      const res = await fetch(url);
      if (cacheable(res)) await cache.put(url, res);
    }),
  );
  for (const request of await cache.keys()) {
    if (new URL(request.url).pathname.startsWith(ASSETS_PATH) && !wanted.includes(request.url)) await cache.delete(request);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(INDEX_KEY, { cache: "no-store" })
      .then((res) => (res.ok ? storeShell(res) : undefined))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return;
  if (NETWORK_ONLY.some((p) => url.pathname.startsWith(p))) return;

  // Pages: newest version from the network, the stored shell when offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const isPage = (res.headers.get("content-type") ?? "").includes("text/html");
          if (res.ok && isPage) event.waitUntil(storeShell(res.clone()).catch(() => undefined));
          return res;
        })
        .catch(async () => (await caches.match(INDEX_KEY)) ?? Response.error()),
    );
    return;
  }

  // Hashed assets never change: cache first
  if (url.pathname.startsWith(ASSETS_PATH)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (cacheable(res)) {
              const copy = res.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icons and the manifest: network, stored copy when offline
  event.respondWith(fetch(request).catch(async () => (await caches.match(request)) ?? Response.error()));
});
