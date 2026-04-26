# RNG Ops

Browser-based, offline-first scoring app for multi-stage shooting matches. Generic — not tied to any specific event. Run an entire match end-to-end on a laptop and a fleet of tablets that stay disconnected from external networks.

**Version 2.0.0** — multi-stage match scoring rewrite. See [RELEASE_NOTES_v2.0.0.md](./RELEASE_NOTES_v2.0.0.md).

## What it does

- **Match setup wizard** — event, divisions, stages, obstacles, penalty/bonus catalogs.
- **Registration** — CSV import/export, 3-digit unique bibs per event, division assignment.
- **Run timing tablet** — start line and finish line, big-button start/finish capture.
- **Stage tablet** — high-contrast dark UI for stress operation. MM:SS wait time, penalty/bonus +/−, Save / No Show / Stage-DQ.
- **Obstacle tablet** — penalty/bonus capture per obstacle station.
- **Results** — division filter, sequential ranking, per-division points = (fastest_in_division / your_time) × max_points, CSV export matching the standard format.
- **Offline-first** — service worker queues mutations to `/api/match/*` and replays them when connectivity returns. Designed for ad-hoc Wi-Fi with no internet.

## Scoring formulas (verified 156/156 against ground-truth CSVs)

```
stage_time = raw + Σ(pen × count) − Σ(bon × count)        (floored at 0)
run_time   = (finish − start) − Σ(stage waits)
             + Σ(obs pen) − Σ(obs bon)                    (floored at 0)
points     = (fastest_in_division / your_time) × max_points
match      = run_points + Σ(stage_points)
```

- **Penalty adds** to raw time. **Bonus subtracts** from raw time.
- **Wait time** is recorded only at the stage (MM:SS) and later subtracted from the run time.
- **Match-DQ** zeros all results; **Stage-DQ** zeros that stage only.

## Stack

- Electron + Express + better-sqlite3 (Drizzle ORM)
- React + Vite + Tailwind + shadcn/ui
- Service worker for offline queue + replay

Match-scoring tables are prefixed `match_*` and the API is mounted at `/api/match/*`.

## Documentation

Two volunteer-friendly guides in `docs/`:

- **Setup Guide** — install on Windows, first launch, ad-hoc Wi-Fi, connect tablets, troubleshooting (9 chapters).
- **Operators Guide** — run a match end-to-end: setup wizard, registration, run timing, stage tablet, obstacle tablet, results, exceptions, offline mode, match-day quick reference (12 chapters).

The same content is published as an interactive HTML site.

## Running locally

Requires **Node.js 20 LTS**. Do not use Node 22+ — `better-sqlite3` prebuilt binaries are only published for Node 20.

```bash
npm install
npm run dev          # dev mode with hot reload
npm run build        # production build → dist/
PORT=5123 NODE_ENV=production node dist/index.cjs
```

Open `http://localhost:5123` in any modern browser. Tablets on the same Wi-Fi reach the laptop at `http://<laptop-ip>:5123`.

## Windows installer

Tagging `vX.Y.Z` triggers `.github/workflows/release.yml` which:

1. Sets up Node 20 + Python 3.11 (for `node-gyp`)
2. Runs `npm ci` and `npm run build`
3. Builds the NSIS installer + portable EXE via `electron-builder`
4. Publishes a GitHub Release with `.exe` artifacts attached

Downloads: see the [Releases page](../../releases).

## Hardware

- **Laptop** — runs the Express server + Electron shell. SQLite database file lives next to the app.
- **Tablets / phones** — Apple or Android, any modern browser. iOS Safari, Android Chrome, Edge, Firefox all work. No native install needed on tablets.
- All devices on a private ad-hoc Wi-Fi network with no internet during the event.

## License

Proprietary. All rights reserved.
