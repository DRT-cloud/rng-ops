# RNG Ops v2.0.0 — Multi-Stage Match Scoring

This is a major rewrite. The application is now a generic, offline-first multi-stage match scoring system, not a biathlon-specific timer.

## What's new

### Match scoring engine
- Pure-function scoring engine with 156/156 verification against historical CSVs
- Run scored at 400 points, each stage at 100 points (configurable)
- Per-division independent scoring; sequential ranking (place = idx + 1)
- Penalty/bonus first-class on every stage and obstacle
- Wait time collected at stage in MM:SS, subtracted from run later
- Floored-at-zero arithmetic on every component time

### Operator stations (browser-based, offline-first)
- **Match Hub** at `/match` — entry point, lists events
- **Setup Wizard** — event, divisions, stages, penalties, bonuses
- **Registration** — CSV import (`bib,first,last,division`), check-in, status pills
- **Run Timing tablet** — large START / FINISH buttons, dark UI, live elapsed timer
- **Stage tablet** — raw time + MM:SS wait + ± penalty/bonus counters, SAVE / NO SHOW / DQ
- **Obstacle tablet** — penalty/bonus counters only, no time entry
- **Results** — division pills, Match/Run/Stage tabs, CSV export matching sample format

### Offline + service worker
- Service worker at `client/public/match-sw.js`
- Intercepts mutations to `/api/match/*`, queues to IndexedDB on offline
- Auto-replays queued writes on next successful network call
- Works on iPad, Android, laptop browsers — pin LAN URL to home screen

### High-contrast tablet UI
- Dark `#0A0A0B` background, `#FAFAFA` text — readable in direct sun
- 64×64 minimum touch targets, 16px gap between buttons
- Color-coded actions: blue (selected/start), green (save/finish), amber (no-show), red (DQ)
- DQ requires double-tap with 3-second arm window

### Backend
- New schema tables prefixed `match_*` — coexist with legacy biathlon tables
- REST API mounted at `/api/match/*`
- SQLite database at `%APPDATA%\RNG Ops\rng-ops.db` (installer) or `data.db` (from-source)
- Frontend routes under `/match/*` — legacy hash routes still work

### Scoring formulas
```
stage_time = raw + Σ(pen × count) − Σ(bon × count), floored at 0
run_time   = (finish − start) − Σ(stage waits) + Σ(obs pen) − Σ(obs bon), floored at 0
points     = (fastest_in_division ÷ your_time) × max_points
match      = run_points + Σ(stage_points)
```

## Documentation
- Setup Guide and Operators Guide rewritten end-to-end for the new architecture
- Interactive HTML site, downloadable DOCX, light/dark themes, full-text search
- Quick reference card with URLs, formulas, button colors

## Compatibility
- Node.js 20 LTS required (pinned in `engines` field). Node 22+ breaks better-sqlite3 prebuilt binaries.
- Windows 11, macOS 12+, Ubuntu 22.04+
- Browsers: Safari 16+, Chrome 110+, Edge 110+, Firefox 110+

## Migration from v1.x
v1.x biathlon tables coexist with v2 match tables in the same SQLite file. Existing v1.x events remain readable through the legacy routes. New events should use the `/match/*` routes exclusively.

## Known limitations
- Service worker does not cache GET responses — reading standings requires the host to be reachable.
- Two operators racing the same record save can result in last-write-wins on replay.
- Match-DQ is laptop-only (Registration screen). Stage-DQ is tablet-only (per-stage).
