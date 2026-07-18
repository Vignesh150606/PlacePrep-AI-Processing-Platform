/// <reference lib="webworker" />
import type { PrecacheEntry } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// NEW (Phase 14, Part 1 -- Mobile Experience & PWA). Hand-written (not
// vite-plugin-pwa's zero-config `generateSW`) because this pass needs two
// things `generateSW`'s declarative config can't express: a real
// `BackgroundSyncPlugin` registration, and a genuine two-tier offline
// fallback (serve the cached app shell first; a dedicated static page only
// if even that isn't available). `injectManifest` bundles this file and
// substitutes `self.__WB_MANIFEST` below with the real precache list at
// build time -- see `vite.config.ts` for the plugin wiring.
//
// Caching strategy, by content type (see PROJECT_STATE.md's Phase 14 entry
// for the full reasoning, including what this deliberately does NOT cover):
//  - App shell (JS/CSS/HTML/icons/fonts) -- precached below via
//    `precacheAndRoute`, served cache-first automatically by workbox.
//  - Supabase (auth + storage) -- NEVER cached (NetworkOnly). Caching an
//    auth/session call risks serving a stale/expired token, which is worse
//    than a clear "you're offline" state.
//  - `/api/v1/*` GET requests -- NetworkFirst, so a student who already
//    opened a page can still read it on a spotty connection, falling back
//    to the last good response instead of a blank screen.
//  - Images (PDF thumbnails, avatars, company logos) -- CacheFirst with a
//    bounded expiration, since these are large and rarely change.
//  - `POST /api/v1/quizzes/attempts/*/submit` -- the one write endpoint
//    queued via Background Sync when offline, replayed once the connection
//    returns. This is the one write action where silently losing the
//    request costs a student real work (a completed quiz attempt). Every
//    other write endpoint (bookmarks, community posts, admin actions,
//    uploads, etc.) is deliberately NOT covered -- those still fail
//    normally offline, surfaced by the app's existing error-toast pattern.
//    Extending background sync further is flagged as remaining work rather
//    than silently assumed safe: several of those writes are multi-step
//    actions where a queued-and-silently-replayed request could contradict
//    state the user already saw change.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, NetworkOnly, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { BackgroundSyncPlugin } from "workbox-background-sync";
import { offlineFallback } from "workbox-recipes";
import { clientsClaim } from "workbox-core";

clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// registerType: 'prompt' -- the client (see `use-pwa-update.ts`) sends this
// message after the person accepts the "update available" prompt, rather
// than the new worker taking over unannounced.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Supabase (auth + storage + postgrest) -- explicit NetworkOnly so it's
// documented, not just "unmatched, falls through to the network anyway."
registerRoute(
  ({ url }) => url.hostname.endsWith(".supabase.co"),
  new NetworkOnly(),
);

// The app's own API, read side.
registerRoute(
  ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/v1/"),
  new NetworkFirst({
    cacheName: "placeprep-api-cache",
    networkTimeoutSeconds: 6,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);

// The one write endpoint covered by background sync -- see header comment.
registerRoute(
  ({ url, request }) =>
    request.method === "POST" && /\/quizzes\/attempts\/[^/]+\/submit$/.test(url.pathname),
  new NetworkOnly({
    plugins: [
      new BackgroundSyncPlugin("quiz-submit-queue", {
        maxRetentionTime: 24 * 60, // minutes -- retry for up to 24h, then give up
      }),
    ],
  }),
  "POST",
);

registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "placeprep-image-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 14 }),
    ],
  }),
);

// Normal case: any client-side route (e.g. a direct load of `/questions`)
// is served the precached app shell, and TanStack Router takes it from
// there using whatever data the routes above can still resolve.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//],
  }),
);

// Belt-and-suspenders case: the app shell itself isn't available (e.g.
// precaching never completed). `offline.html` is a static, dependency-free
// page -- not the React app -- so it can render with nothing else cached.
offlineFallback({ pageFallback: "/offline.html" });
