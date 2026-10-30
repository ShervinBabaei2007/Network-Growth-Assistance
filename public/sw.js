/*
 * Service worker for the installed app. It keeps two things and nothing else:
 *
 *  1. Static build files (/_next/static/*): hashed and public, cached forever.
 *  2. A read-only copy of the two pages worth reading offline: today's queue and saved jobs. These are about the
 *     person, so the copy is private-by-design: it lives in its own cache, expires after 12 hours, and is deleted the
 *     moment the browser visits the sign-in page (which is where signing out lands, and where the next person starts).
 *
 * Nothing else is cached: no API responses, no other pages, no form posts. Offline, the two copies open read-only and
 * anything else shows a plain offline page.
 */

const STATIC_CACHE = "static-v1";
const PRIVATE_CACHE = "private-v1";
const PRIVATE_TTL_MS = 12 * 60 * 60 * 1000;
const OFFLINE_URL = "/offline.html";

/** The only pages kept for offline reading. */
const isRemembered = (url) => url.pathname === "/queue" || (url.pathname === "/jobs" && url.searchParams.get("tab") === "saved");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== STATIC_CACHE && key !== PRIVATE_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") event.respondWith(navigate(event, request, url));
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function navigate(event, request, url) {
  // Signing out, or signing in as someone else, both pass through here: forget the last person's pages.
  if (url.pathname === "/login" || url.pathname.startsWith("/auth")) await caches.delete(PRIVATE_CACHE);

  try {
    const response = await fetch(request);
    if (isRemembered(url) && response.ok && !response.redirected && response.type === "basic") {
      event.waitUntil(remember(request, response.clone()));
    }
    return response;
  } catch {
    if (isRemembered(url)) {
      const cache = await caches.open(PRIVATE_CACHE);
      const hit = await cache.match(request, { ignoreVary: true });
      if (hit && Date.now() - Number(hit.headers.get("x-cached-at")) < PRIVATE_TTL_MS) return hit;
      if (hit) await cache.delete(request, { ignoreVary: true });
    }
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function remember(request, response) {
  const headers = new Headers(response.headers);
  headers.set("x-cached-at", String(Date.now()));
  const body = await response.blob();
  const cache = await caches.open(PRIVATE_CACHE);
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
}
