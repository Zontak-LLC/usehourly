/*
 * UseHourly service worker: lets the app open without a connection.
 *
 * - Built files (/_next/static/..., icons) never change under the same name, so they are kept and served from the
 *   cache first.
 * - A page in the app (/dashboard/...) is fetched from the network first, and a copy is kept. With no connection (or a
 *   very slow one, once a copy exists) the kept copy opens instead; a page that was never opened falls back to the same
 *   page without its query (a copy of /dashboard/week for /dashboard/week?date=...), then to /offline.html. It never
 *   shows one page under another page's address.
 * - Nothing else is touched: the API, sign-in, other sites and anything that is not a plain GET go straight through, so
 *   this can never answer for the server.
 * - The kept pages hold the person's own data, so the app sends the message "clear" on sign-out and when a different
 *   person signs in, and the pages cache is deleted.
 */
const VERSION = "v1";
const STATIC = `hourly-static-${VERSION}`;
const PAGES = `hourly-pages-${VERSION}`;
const SLOW_AFTER_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(keepOfflinePage().then(() => self.skipWaiting()));
});

// The host may redirect /offline.html to /offline, and a browser refuses to show a redirected response for a page
// opening. So the page is copied into a fresh response (never marked as redirected) before it is kept.
async function keepOfflinePage() {
  const response = await fetch("/offline.html");
  if (!response.ok) throw new Error("offline page unavailable");
  const body = await response.blob();
  const cache = await caches.open(STATIC);
  await cache.put(
    "/offline.html",
    new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }),
  );
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n.startsWith("hourly-") && n !== STATIC && n !== PAGES).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") {
    event.waitUntil(
      caches
        .keys()
        .then((names) => Promise.all(names.filter((n) => n.startsWith("hourly-pages")).map((n) => caches.delete(n)))),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate" && (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/"))) {
    event.respondWith(networkFirstPage(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    try {
      await cache.put(request, response.clone());
    } catch {
      // storage full: serve it without keeping it
    }
  }
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  const cached = await cache.match(request.url);
  const network = fetch(request).then(async (response) => {
    // Keep only a real page for this person: not a redirect (to the log-in page) and not an error.
    if (response.ok && !response.redirected && response.type === "basic") {
      try {
        await cache.put(request.url, response.clone());
      } catch {
        // storage full: show it without keeping it
      }
    }
    return response;
  });
  network.catch(() => undefined);
  try {
    if (!cached) return await network;
    const slow = new Promise((resolve) => setTimeout(resolve, SLOW_AFTER_MS, null));
    return (await Promise.race([network, slow])) ?? cached;
  } catch {
    const url = new URL(request.url);
    return (
      cached ??
      (url.search ? await cache.match(url.origin + url.pathname) : undefined) ??
      (await caches.match("/offline.html")) ??
      Response.error()
    );
  }
}
