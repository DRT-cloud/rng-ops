// Phase 1 service worker — install/activate plumbing only, fetch is pass-through.
//
// What's intentionally NOT here:
//   - Cache strategies (cache-first, network-first, stale-while-revalidate).
//     These land in Phase 4 alongside the queue→Pocketbase sync logic.
//   - Path exclusions for /api/ and /_/ (Pocketbase REST + admin UI).
//     Phase 4 must add these explicitly when caching arrives — see the
//     post-Phase-1 todo "Phase 4 SW cache strategy must explicitly exclude
//     /api/ and /_/ paths from any caching".
//
// Cache version is hardcoded for Phase 1. Switch to build-time injection
// (vite.config.ts `define`) when Phase 4 introduces actual cache writes.
//
// TypeScript note: the parent tsconfig.json includes both DOM and WebWorker
// libs, which makes the global `self` ambiguous (Window vs.
// ServiceWorkerGlobalScope). We cast once via a local alias `sw` so the
// SW-specific event types resolve correctly without `declare global`
// pollution.

/// <reference lib="webworker" />

export {}; // mark this file a module so the cast-alias below is local-scope only

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_VERSION = "rng-ops-v1";

sw.addEventListener("install", (event) => {
  // Activate immediately on first install. Without skipWaiting the new SW
  // would idle until all clients close, which we don't want during Phase 1
  // iteration.
  event.waitUntil(sw.skipWaiting());
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Take control of any already-open pages so the very first load after
      // registration uses this SW without a hard refresh.
      await sw.clients.claim();

      // Clean up any caches whose key doesn't match the current version.
      // Phase 1 never opens a cache, so this is a no-op until Phase 4 ships
      // a strategy that does — leaving the pruning here keeps the contract
      // consistent across versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
    })(),
  );
});

sw.addEventListener("fetch", (_event) => {
  // Pass-through. Letting the event return without calling event.respondWith()
  // means the browser handles the request normally. Phase 4 will add
  // strategies here, gated on a path filter that excludes /api/ and /_/.
});
