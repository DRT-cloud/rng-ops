# RNG Ops v2.0.5

The Electron app now launches successfully. This release fixes a feature-level bug encountered after launch: importing a squadding PDF showed "PDF parse failed — n.toHex is not a function".

## Cause

`pdfjs-dist` 5.x relies on `Uint8Array.prototype.toHex`, a Stage-3 JavaScript proposal method that landed in Chromium 134. The Electron build shipping with this release uses an older Chromium where the method is absent, so the minified pdfjs code fails the moment a PDF is loaded.

## Fix

- `client/src/polyfills.ts` — polyfills `Uint8Array.prototype.toHex` / `fromHex` / `toBase64` / `fromBase64` for older Chromium runtimes.
- `client/src/main.tsx` — imports the polyfill before any other code so it applies to all subsequent module evaluations.
- `client/src/pages/SetupPage.tsx` — runs pdfjs in the main thread (`disableWorker: true`) so the polyfilled prototype methods are visible. The PDFs in question are small (typed text, a few pages) so there is no perceptible perf hit from skipping the worker.

## Verified

End-to-end test against the actual squadding PDF (`squadding.pdf` from the repo owner): pdfjs parses all 4 pages, returns 155 slot items, finds 8 timed bays + 2 staff bays — matching the document.
