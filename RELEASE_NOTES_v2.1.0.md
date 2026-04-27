# RNG Ops v2.1.0 — Squadding HTML import

## New feature

Import a PractiScore **squadding HTML export** to bulk-create real registrations
with day, bay, time, and slot assignments — replacing the old "count the slot
lines from a PDF" approach.

### What it does

- Upload the squadding HTML (from PractiScore: *Squadding → Print → Save as HTML*)
  on the Registration page.
- The client parses the document with the browser's DOMParser and shows a preview:
  total bays, total shooters, empty slots, division list, per-bay breakdown.
- Click **Import (append)** to add new shooters, or **Replace all** to wipe
  existing competitors/squads first.

### Behavior

- 3-digit zero-padded sequential bibs (`001`, `002`, …) continuing from the
  current max.
- Divisions are auto-created from the source labels (e.g. *Nv 2-Gun*, *2-Gun*,
  *Nv Pcc*, *Pcc*) and reused on subsequent imports — no duplicates.
- Empty/Reserved slots are skipped silently.
- STAFF squads carry no time window (`time_start` / `time_end` are NULL).
- Multi-word last names (e.g. *Van Vranken*, *Stoner Fri Nv*) are preserved.
- The whole import runs in a single SQLite transaction — atomic.

### New schema

```sql
CREATE TABLE match_squads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  competitor_id INTEGER NOT NULL UNIQUE,
  day TEXT NOT NULL,            -- FRIDAY | SATURDAY | SUNDAY | STAFF
  bay INTEGER NOT NULL,
  time_start TEXT,              -- 'HH:MM' or NULL for STAFF
  time_end TEXT,
  slot_number INTEGER NOT NULL
);
```

Existing v2.0.x databases pick up the new table automatically on next launch
(idempotent `CREATE TABLE IF NOT EXISTS`).

### New API endpoints

- `POST /api/match/events/:id/import-squadding` — body
  `{ bays: [...], replace?: boolean }`. Returns `{ ok, competitors, squads, divisions }`.
- `GET  /api/match/events/:id/squads` — list squad assignments.

## Verified locally against the 2026 Twilight Biathlon export

| Metric          | Expected | Actual |
| --------------- | -------- | ------ |
| Bays            | 11       | 11     |
| Shooters        | 109      | 109    |
| Divisions       | 4        | 4      |
| Bib range       | 001–109  | 001–109 |
| FRIDAY / SAT / STAFF | 33 / 64 / 12 | 33 / 64 / 12 |

Re-import with `replace=true` is idempotent (counts unchanged, no division
duplication).
