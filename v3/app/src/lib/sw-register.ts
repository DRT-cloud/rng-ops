// Service worker registration helper.
//
// Dev mode skips registration: Vite's dev server handles HMR via its own
// websocket and aggressive module replacement. A registered SW that
// intercepts fetch (even pass-through) tends to confuse the dev pipeline
// and leaves stale state across reloads.
//
// Prod mode registers /sw.js. Logs success and failure to the console;
// nothing else surfaces failures yet — Phase 3 will add an admin banner
// when SW registration fails on a tablet (offline mutation queue depends
// on it).

export function register(): void {
  if (import.meta.env.DEV) {
    return;
  }

  if (!("serviceWorker" in navigator)) {
    console.warn("[sw-register] navigator.serviceWorker not available");
    return;
  }

  // Discoverable explanation for anyone investigating why the iPad/Chrome
  // PWA install prompt is not appearing. Browsers suppress the prompt when
  // manifest icons fail to load; today's icon paths are placeholders until
  // Phase 5 ships real assets sourced from the Twilight logo.
  console.warn(
    "[RNG Ops] PWA install prompts are intentionally disabled in Phase 1. " +
      "Real icons land in Phase 5; manifest icon paths are placeholders until then.",
  );

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log(
          "[sw-register] registered, scope:",
          registration.scope,
        );
      })
      .catch((err) => {
        console.error("[sw-register] registration failed:", err);
      });
  });
}
