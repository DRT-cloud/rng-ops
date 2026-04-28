# RNG Ops v3 — Project Memory (FINAL — spec locked)

**Generated:** 2026-04-27
**Status:** Spec locked. All open questions resolved. Ready for build.
**Owner:** Cody Allenbaugh — GitHub `DRT-cloud`
**First deployment:** Twilight Biathlon, Pawnee, OK — twilightbiathlon.com
**Repo strategy:** New branch `v3` in `DRT-cloud/rng-ops`
**Generic product name:** "RNG Ops" — Twilight applied as theme only

---

## 1. What this app is

A range operations console for run-and-gun biathlon-style matches. 5K running and shooting event. Competitors run a course; between 3 and 10 stages along the course; each stage is shot/scored separately. Plus optional obstacle stations (physical obstacles like walls — failure adds time penalty to run time).

**Scoring philosophy:** 50% run / 50% shoot, per-division independently, USPSA-style hit-factor normalization.

---

## 2. Hard constraints (verbatim user directives)

| # | Constraint |
|---|---|
| C1 | Browser-based for all operator devices |
| C2 | Fully offline during the event — no internet, no CDNs at runtime, no DNS, WAN cable never plugged in at event location |
| C3 | Dark high-contrast colorful functional UI (default) — operators stressed, outdoors, at night |
| C4 | Generic product name "RNG Ops" everywhere in code/strings; Twilight applied as theme only |
| C5 | Wait time MM:SS. Stage time SSS.hh (seconds with hundredths, e.g. `148.27` = 2:28.27). Run time computed in seconds. Display in MM:SS where appropriate. |
| C6 | Stage scoring rule: `final_time = raw + penalties − bonuses` (penalties add, bonuses subtract) |
| C7 | Never use the words "scrape/scraping/crawl/crawling" |
| C8 | Audience is advanced (manufacturing/SME) — concise, factual, no marketing tone |
| C9 | **4-digit `SSSL` bibs** — squad number (2 digits) + slot number (2 digits), zero-padded. E.g. Squad 1 Slot 1 = `0101`, Squad 11 Slot 8 = `1108` |
| C10 | NO DQ in v3 — removed entirely. DNS replaces stage-DQ. No-show only at run level |
| C11 | Don't re-ask for plan approval after acceptance |
| C12 | GitHub ops via `bash` with `api_credentials=["github"]`, never the GitHub MCP connector |
| C13 | Cascade thinking — enumerate side effects of every fix up front |
| C14 | Original score records always recoverable. Edits never overwrite — they create a new event row that supersedes the prior. Originals never modified. |
| C15 | UI follows the **Dark Industrial brand framework** (semantic 3-color action/info/warning system) with Twilight identity (logo, fonts, NV Green reserved for status-OK only). |

---

## 3. Hardware and operating environment

| Item | Value |
|---|---|
| Host laptop | Windows 11, i7 11th gen, 32 GB RAM, NVIDIA P2000 GPU |
| Stage devices | iPads (primary). iPhones supported (nice-to-have, not required) |
| Network | GL.iNet GL-MT3000 Beryl AX router. LAN-only. WAN port unused at event location |
| Concurrent operators | ~10–15 |
| Concurrent competitors per event | ~110 (plan for 200) |
| Divisions per event | 1–6 (typically 4) |
| Stages per event | 3–10 |
| Obstacle stations | 0+ (optional) |
| Event duration | 1–2 days, 8–14 active hours per day |
| Power | Generator-grade — must tolerate brief power loss with no data corruption |

**Critical operational characteristic:** Stage iPads operate **out of LAN range during the event**. They bootstrap from the laptop pre-event, run fully offline, and sync at end-of-event when brought back into range.

---

## 4. Architecture (LOCKED)

### 4.1 Stack

| Layer | Choice |
|---|---|
| Backend | **Pocketbase 0.22+** (single Go binary, ~30 MB Windows .exe) |
| Database | SQLite embedded in Pocketbase, WAL mode |
| Custom backend logic | Pocketbase JS hooks (scoring engine, import parsers, sync conflict resolution, PDF generation) |
| Frontend | React 18 + Vite + TypeScript + Tailwind v3 + shadcn/ui + wouter + TanStack Query + Zustand |
| Offline | Service worker + IndexedDB write queue |
| TLS on LAN | mkcert self-signed CA (required for service worker on iPads) |
| Theming | Single `tokens.css` (Dark Industrial framework + Twilight identity) |
| PDF generation | `pdf-lib` or HTML-to-PDF in Pocketbase JS hooks (all printable outputs are PDF) |
| Distribution | Folder containing `pocketbase.exe` + `pb_public/` + `pb_hooks/` + `theme/` |
| Software cost | $0 |

### 4.2 What we explicitly drop

- ❌ Electron, asar, electron-builder, Windows code signing
- ❌ Multi-OS installer pipeline, auto-update infrastructure
- ❌ pdfjs (PDF parsing dead — HTML/CSV only for input; PDF for output)
- ❌ DOCX output — PDF only for all printable artifacts
- ❌ `localStorage` (in-memory + IndexedDB only)
- ❌ Hardware timer integration (manual entry only)
- ❌ All DQ logic (replaced by DNS at stage, no-show at run)
- ❌ Stage time cap (no cap — whatever volunteer enters is what's used)

### 4.3 What we explicitly keep from v2.1.0

- ✅ Service worker offline mutation queue pattern
- ✅ PractiScore squadding HTML parser
- ✅ ThemeProvider pattern
- ✅ Verification discipline
- ✅ Verified scoring fixtures (`run-results.csv`, `stage-1-results.csv`)

---

## 5. Scoring model (LOCKED)

### 5.1 Per-segment formula (USPSA hit-factor)

For each segment (run + each stage), per division, independently:

```
segment_points = (division_best_segment_time / my_segment_time) × segment_max_points
```

Where:
- Each stage `max_points = 100` (constant)
- Run `max_points = stage_count × 100` (auto-derived)
- DNS on stage → `segment_points = 0` for that stage
- No-show overall → omitted from results entirely
- **No time cap** — raw stage time is whatever the volunteer entered

### 5.2 Time computations

```
my_stage_time(stage) =
    IF dns: not used (segment_points = 0)
    ELSE:   stage_raw_seconds
          + Σ (catalog.seconds × count) for stage penalties
          − Σ (catalog.seconds × count) for stage bonuses

my_run_time =
    (run_finish_ms − run_start_ms) / 1000
  + Σ (obstacle_catalog.seconds × count) for obstacle penalties (cumulative, all stations)
  − Σ (obstacle_catalog.seconds × count) for obstacle bonuses (cumulative, all stations)
  − Σ wait_seconds (all stages)
```

### 5.3 Total score and ranking

```
my_total_pts = run_pts + Σ stage_pts (across all stages)
```

Higher total wins. Each division ranked independently.

### 5.4 Tiebreaker (LOCKED)

When two competitors in the same division finish with identical `total_pts`:
**Lower combined raw time across run + all stages wins.**

```
tiebreaker_seconds(competitor) =
    raw_run_seconds                  // (finish_ms − start_ms) / 1000
  + Σ raw_stage_seconds              // sum of unmodified stage_raw, treating DNS as 0
```

### 5.5 50/50 split — automatic

Run worth `stage_count × 100`, all stages combined worth `stage_count × 100`. 50/50 weighting is automatic regardless of stage count.

| Stages | Run max | Stages combined max | Total | Split |
|---|---|---|---|---|
| 3 | 300 | 300 | 600 | 50/50 |
| 4 | 400 | 400 | 800 | 50/50 |
| 10 | 1000 | 1000 | 2000 | 50/50 |

### 5.6 Where scoring runs

**Tablets do NOT compute scores.** Tablets record raw inputs only. Laptop is the single source of scoring truth. Computed on read against current catalog values.

---

## 6. Run schedule generation (LOCKED)

### 6.1 Inputs

- Start time (operator-set)
- Default interval (operator-set, e.g. 5 minutes / 300 seconds)
- Squad and slot order from PractiScore CSV + HTML
- Optional pre-defined start groups (multi-start)

### 6.2 Cascading interval rule

Operator can group competitors at schedule-time **or live at start line**. When a group of size `m` starts simultaneously:

```
- All m competitors leave at the same time
- The next scheduled start is pushed back by (m × interval) from the group's start
- All downstream slots cascade by the same delta

Example with interval = 5 min, slots 1, 2, 3 grouped:
  Slots 1, 2, 3:  leave at  0:00  (together)
  Slot 4:         leaves at 0:15  (3 × 5 min after the group)
  Slot 5:         leaves at 0:20  (5 min after slot 4)
```

### 6.3 Live operator override at start line

Operator can combine the next 2–4 competitors on the fly. The app:
1. Assigns them the same `start_group_id` and same `scheduled_at_ms`
2. Recomputes `scheduled_at_ms` for everyone downstream by `(group_size × interval)`

### 6.4 Schedule output

- App generates and prints schedule as **PDF**
- PDF input is reference only — never parsed
- Re-printable after check-in adjustments (no-shows pushed to end)

---

## 7. Schema (LOCKED)

All tables prefixed `match_`. Pocketbase collections map 1:1.

### 7.1 Event setup

```
match_events
  id, name, event_date, start_time, default_interval_seconds (default 300),
  default_obstacle_penalty_seconds (default 300),
  status TEXT CHECK(status IN ('pending','active','data_collection','closed')),
  backup_path TEXT,
  created_at

match_divisions
  id, event_id, code, name, sort_order

match_stages
  id, event_id, code, name, sort_order

match_obstacle_stations
  id, event_id, code, name, sort_order
```

### 7.2 Catalogs (per-stage, per-station)

```
match_stage_catalog
  id, event_id, stage_id, code, label, seconds REAL, kind ∈ penalty|bonus,
  sort_order, is_active
  UNIQUE (event_id, stage_id, code)

match_obstacle_catalog
  id, event_id, obstacle_station_id, code, label, seconds REAL, kind ∈ penalty|bonus,
  sort_order, is_active
  UNIQUE (event_id, obstacle_station_id, code)
```

### 7.3 Default catalog seeds

When a new stage is created, seed:

| Code | Label | Seconds | Kind |
|---|---|---|---|
| `ftn` | Fail to Neutralize | +20 | penalty |

When a new obstacle station is created, seed:

| Code | Label | Seconds | Kind |
|---|---|---|---|
| `obstacle_failed` | Obstacle Failed | +300 | penalty |

Operator adds more entries per-stage and per-station as needed at event setup.

### 7.4 Competitors and squads

```
match_competitors
  id, event_id, bib (4-digit SSSL format),
  first_name, last_name, division_id,
  status (registered|checked_in|late_arrival|no_show|withdrawn),
  shooter_id (from PractiScore)
  UNIQUE (event_id, bib)

match_squads
  id, event_id, competitor_id UNIQUE (event_id, competitor_id),
  day, bay, time_start, time_end, slot_number
```

### 7.5 Run schedule

```
match_run_schedule
  id, event_id, competitor_id,
  scheduled_at_ms INTEGER,
  start_group_id INTEGER NULL,    -- competitors with same group_id leave together
  group_size INTEGER DEFAULT 1,
  sequence INTEGER NOT NULL       -- ordering within the schedule
  UNIQUE (event_id, competitor_id)
```

### 7.6 Run timing (event-sourced, append-only)

```
match_run_events
  id, event_id, competitor_id,
  start_ms NULL, finish_ms NULL,
  status TEXT CHECK(status IN ('ok','no_show')),
  recorded_device_id, recorded_by, recorded_at_ms,
  supersedes_id NULL, superseded_at_ms NULL, edit_reason NULL
```

### 7.7 Stage scores (event-sourced, append-only)

```
match_stage_score_events
  id, event_id, stage_id, competitor_id,
  wait_seconds REAL DEFAULT 0,           -- MM:SS input, stored as seconds
  raw_seconds REAL DEFAULT 0,            -- SSS.hh input, stored as seconds
  dns BOOLEAN DEFAULT FALSE,
  selections_json TEXT,                  -- [{"catalog_id":3,"kind":"penalty","count":2}, ...]
  recorded_device_id, recorded_by, recorded_at_ms,
  synced_at_ms NULL,
  supersedes_id NULL, superseded_at_ms NULL, edit_reason NULL
```

### 7.8 Obstacle scores (event-sourced, append-only)

```
match_obstacle_score_events
  id, event_id, obstacle_station_id, competitor_id,
  selections_json TEXT,                  -- penalties/bonuses with counts; cumulative
  recorded_device_id, recorded_by, recorded_at_ms,
  synced_at_ms NULL,
  supersedes_id NULL, superseded_at_ms NULL, edit_reason NULL
```

### 7.9 Audit and sync

```
match_audit
  id, event_id, actor TEXT, actor_role TEXT NULL, actor_device_id TEXT NULL,
  action, payload_json, created_at

match_sync_conflicts
  id, event_id, target_table, target_key_json, losing_payload_json,
  reason, resolved BOOLEAN DEFAULT FALSE, resolved_by NULL, resolved_at_ms NULL
```

### 7.10 Active-score views

```sql
CREATE VIEW v_active_stage_scores AS
SELECT * FROM match_stage_score_events WHERE superseded_at_ms IS NULL;

CREATE VIEW v_active_obstacle_scores AS
SELECT * FROM match_obstacle_score_events WHERE superseded_at_ms IS NULL;

CREATE VIEW v_active_run_records AS
SELECT * FROM match_run_events WHERE superseded_at_ms IS NULL;
```

---

## 8. Roles (defined now, enforced in v3.1)

| Role | Permissions |
|---|---|
| `admin` | Full access, event setup, reset, edit any record |
| `checkin` | Registration + check-in only |
| `starter` | Start/finish line operations |
| `stage` | One stage tablet (logical scope; not enforced by stage_id in v3.0) |
| `scoring` | Results read + CSV export |
| `display` | Live display only, read-only |

PIN binds to role. v3.0 stamps everything as `admin`. PIN enforcement deferred to v3.1.

---

## 9. Device labels

Pre-made dropdown at first iPad load, stored in IndexedDB.

| Label | Role | Device |
|---|---|---|
| `Host-Laptop` | admin / starter / scoring | Windows laptop |
| `Checkin-1`, `Checkin-2` | checkin | Optional separate tablet(s) |
| `Stage-1` through `Stage-10` | stage | iPads (auto-generated up to event's stage count) |
| `Obstacle-1`, `Obstacle-2` | stage | iPads |
| `Jury-1` | admin (post-event) | Any tablet |
| `Display-1` | display | TV/monitor browser |

---

## 10. Backup strategy (three independent layers + event sourcing)

| Layer | Latency | Reliability | Mechanism |
|---|---|---|---|
| 1. SQLite Online Backup API | 5 min active / 30 min idle | High | Operator-picked path at first run. `data-YYYYMMDD-HHMMSS.db`. Retain 24 rolling + 1/day × 7. Drive unavailable → log error + admin banner. |
| 2. iPad Files-app JSON export | Operator-triggered | Very high | "Backup Stage Data" button. iOS Share Sheet → Save to Files. Restore: laptop "Import Stage Backup" admin page. |
| 3. Paper backup sheet | Real-time | Highest | Pre-populated PDF per stage, ordered by squad. Filled by hand in parallel. |

**Plus event-sourced storage:** every score write append-only. Originals always recoverable from the database itself.

**Event-close archive:** `event-close-<event-name>-<date>.zip` containing results, audit log, competitors, squads, final SQLite snapshot.

---

## 11. Stage tablet UI (LOCKED FLOW)

### 11.1 Persistent header (every screen)

- Stage name large at top: `STAGE 3 — "BUNKER"` (Barlow Condensed uppercase, Crisp White on Forge Black)
- **3px Brand Red `#CC2229` accent bar** under the stage name (Dark Industrial section accent rule)
- Sub-bar: device label · volunteer name · catalog version (Vapor body color)
- Header fixed, never scrolls

### 11.2 Persistent competitor pill (every entry screen, after selection)

- Surface: Charcoal Steel `#1C2128` (Level 1)
- Border: Steel Gray `#4A5568` 1px
- Name (last, first): Crisp White, Barlow Condensed uppercase
- Bib + division: Vapor `#B0BAC9`, Inter

```
┌────────────────────────────────────────┐
│  ADAMS, DAVID                          │
│  Bib 0142 · 2-GUN                      │
└────────────────────────────────────────┘
```

### 11.3 Screen flow — happy path (5 screens)

1. **Roster** — alphabetical by `last_name ASC, first_name ASC`. Search by name. Filter by division. Filter by status. Tap row → Screen 2.

2. **Wait Time** — number pad MM:SS entry. Digits push left-to-right (SS first, then MM). `00:00` valid. Soft cap `99:59`. "NO WAIT TIME (0:00)" shortcut button (outlined Brand Blue).

3. **Stage Time** — number pad `SSS.hh` entry (e.g., `148.27` = 2:28.27 = 148.27 seconds). Decimal in fixed position. Echoes wait time. **"DID NOT SHOOT (DNS)" button — Brand Red outline** (action-class) → skips Screen 4.

4. **Penalties & Bonuses** — chip grid from this stage's catalog. Each chip: label + signed seconds + count + `+` / `−`. Chip surface: Gunmetal `#2E3440`. "NO PENALTIES OR BONUSES" shortcut. Skipped on DNS path.

5. **Review & Approve** — all entered data shown back. **No score computed or shown.** Volunteer name field auto-fills. **"EDIT" button (Brand Blue outline)** walks back-stack one screen at a time. **"APPROVE & RECORD" button (Brand Red filled, white bold text)** appends event row, returns to Roster.

### 11.4 DNS path (3 active screens)

`Roster → Wait Time → Stage Time (DNS) → Review → Approve`

### 11.5 Edit flow

Tap `RECORDED`/`EDITED` row → shows current record + history. EDIT walks the same 4-screen flow with values pre-populated. On approve:
- New event row inserted with `supersedes_id` pointing at previous active row
- Previous row's `superseded_at_ms` set; row never modified
- **`edit_reason` REQUIRED** — dropdown:
  - Wrong wait time entered
  - Wrong stage time entered
  - Wrong penalty count
  - Wrong bonus count
  - DNS toggled in error
  - Other (free text)
- Roster status badge updates per §12.5

---

## 12. Branding (LOCKED — Dark Industrial framework + Twilight identity)

### 12.1 Brand framework

Built on the **Dark Industrial Brand Style Guide** with Twilight Biathlon identity drop-ins. All structural conventions (3-tier surfaces, semantic 3-color action system, typography weights) follow Dark Industrial. Identity layer (logo, fonts, NV Green status accent, tagline) is Twilight.

### 12.2 Color tokens

```css
/* === RNG Ops v3 — Dark Industrial framework + Twilight identity === */

/* Structural backgrounds */
--rng-bg-base:           #0F1114;   /* Forge Black — page/app background */
--rng-bg-surface:        #1C2128;   /* Charcoal Steel — cards, panels, sidebars */
--rng-bg-elevated:       #2E3440;   /* Gunmetal — modals, dropdowns, hover rows */
--rng-border:            #4A5568;   /* Steel Gray — hairlines, input borders */

/* Text */
--rng-text-primary:      #F4F5F7;   /* Crisp White — headlines, high-contrast labels */
--rng-text-body:         #B0BAC9;   /* Vapor — paragraph copy, table cells */
--rng-text-muted:        #4A5568;   /* Steel Gray — captions, timestamps */

/* Semantic accents (Dark Industrial 3-color system) */
--rng-action:            #CC2229;   /* Brand Red — CTAs, APPROVE & RECORD, primary actions */
--rng-action-hover:      #A81B21;
--rng-info:              #2358A6;   /* Brand Blue — links, table headers, info callouts, navigation */
--rng-info-hover:        #1A4080;
--rng-warning:           #F5C518;   /* Safety Yellow — caution callouts (≤10% surface) */

/* Status (Twilight green reserved exclusively for OK / synced / done states) */
--rng-status-ok:         #00E474;   /* NV Green — RECORDED, synced, complete */
--rng-status-pending:    #B0BAC9;   /* Vapor — PENDING, neutral */
--rng-status-edited:     #F5C518;   /* Safety Yellow — EDITED (has prior history) */
--rng-status-error:      #CC2229;   /* Brand Red — sync conflict, validation error */

/* Fonts (Twilight identity, locally bundled — no Google Fonts CDN at runtime per C2) */
--rng-font-display:      'Barlow Condensed', Arial Narrow, Arial, sans-serif;
--rng-font-body:         'Inter', system-ui, -apple-system, Arial, sans-serif;
--rng-font-mono:         'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
```

### 12.3 Typography rules

| Role | Font | Weight | Color |
|---|---|---|---|
| Display / hero headline | Barlow Condensed | 800–900 | Crisp White |
| Section heading (H2/H3) | Barlow Condensed | 700 | Crisp White |
| Subheading / label | Inter | 600 | Vapor |
| Body copy | Inter | 400 | Vapor |
| Caption / footnote | Inter | 400 | Steel Gray |
| CTA button text | Inter | 700 | Crisp White |
| Hyperlink | Inter | 400 | Brand Blue |
| Code / time / mono | JetBrains Mono | 400/600 | Vapor |

Headings use uppercase + letter-spacing 0.05em.

### 12.4 Component patterns

**Primary action button (APPROVE & RECORD, primary CTAs):**
- Background: Brand Red `#CC2229`
- Text: Crisp White, Inter 700
- Hover: Brand Red darkened `#A81B21`
- Border radius: 4px (sharp/industrial)

**Secondary / outline button (EDIT, BACK, navigation):**
- Background: transparent
- Border: 1.5px solid Brand Blue `#2358A6`
- Text: Brand Blue
- Hover bg: Brand Blue at 15% opacity

**DNS button (action-class, irreversible-ish):**
- Background: transparent
- Border: 1.5px solid Brand Red
- Text: Brand Red
- Hover bg: Brand Red at 15% opacity

**Cards / panels:**
- Background: Charcoal Steel `#1C2128`
- Border: 1px solid Steel Gray (optional)
- Shadow: `0 2px 12px rgba(0,0,0,0.5)`
- Radius: 6–8px
- Padding: 20–24px

**Tables (results, audit log, sync conflicts):**
- Header row bg: Brand Blue `#2358A6` at 20% opacity OR Gunmetal `#2E3440`
- Header text: Crisp White
- Body rows: Charcoal Steel alternating with Gunmetal
- Cell text: Vapor
- Borders: Steel Gray

**Penalty/bonus chips:**
- Background: Gunmetal `#2E3440`
- Border: 1px Steel Gray
- Label: Inter SemiBold, Vapor
- Seconds value: JetBrains Mono, signed (red `+20s` for penalty, green `−5s` for bonus)
- Active count badge: Crisp White on Gunmetal

### 12.5 Status badge palette

| Status | Background / outline | Text | Where used |
|---|---|---|---|
| `PENDING` | Vapor outline | Vapor | Roster row not yet scored |
| `RECORDED` | NV Green `#00E474` filled | Forge Black | Roster row scored |
| `EDITED` | Safety Yellow `#F5C518` filled | Forge Black | Roster row with prior history |
| `SYNC CONFLICT` | Brand Red filled | Crisp White | Conflicts queue |
| `SYNCED` | NV Green outline | NV Green | Tablet sync indicator |

### 12.6 Stage-name accent bar

Every operator-facing screen header includes a **3px solid Brand Red `#CC2229` bar, ~48px wide**, centered or left-aligned beneath the stage/section name. This is the Dark Industrial section-accent convention — anchors the page identity to the action color.

### 12.7 Logo

`favicon.svg` (Twilight: white T with NV Green `#00E474` reticle on Forge Black). 36 px in app header. PWA icon pack at 192/512.

Logo placement rules per Dark Industrial guide: white/light version only, on Forge Black or Charcoal Steel. Never on Gunmetal without contrast verification.

### 12.8 Tagline (spectator display only)

"Run the Dark. Shoot the Dark." — Twilight identity, never appears on operator surfaces.

### 12.9 Generic product naming

In code, page titles, installer metadata, audit logs: **"RNG Ops"** (C4). Theme can override the public-facing display name on spectator-display only (e.g., "Twilight Biathlon — Live").

### 12.10 Accessibility floor

- All body text (Vapor on Charcoal Steel) achieves WCAG AA contrast minimum
- All headlines (Crisp White on Forge Black) achieve WCAG AAA
- CTA buttons (Crisp White on Brand Red) pass WCAG AA
- All status badge color combinations validated for outdoor night-vision-adapted operator legibility

---

## 13. Data ingestion

### 13.1 Registration (PractiScore CSV)

Required columns: `First Name, Last Name, Email, Division, Squad, Approval Status, Shooter Id`.

**Filter rule (LOCKED):**
```
INCLUDE rows where Approval Status IN ('Approved', 'Approved - Staff')
Paid Status is IGNORED entirely (staff are unpaid by design;
payment is not a scoring concern)
```

Divisions auto-created from CSV's Division column. Sample data: `2-Gun`, `NV 2-Gun`, `PCC`, `NV PCC`.

### 13.2 Squad slot order (PractiScore HTML)

Slot order parsed from PractiScore HTML squadding export (verified parser from v2.1.0).

"Reserved" and "Empty" slot lines ignored — no competitor record, no bib consumed.

### 13.3 Bib assignment (LOCKED)

**4-digit `SSSL` format** = squad number (2 digits) + slot number (2 digits), zero-padded.

| Squad | Slot | Bib |
|---|---|---|
| 1 | 1 | `0101` |
| 1 | 15 | `0115` |
| 2 | 2 | `0202` |
| 11 | 8 | `1108` |

Maximum squad = 99, maximum slot/squad = 99. Sample data uses squads 1–12 with up to 15 slots — well within bounds.

### 13.4 Run schedule

App-generated from start time + interval + squad/slot order + start groups. PDF output for printing. PDF input is reference only.

---

## 14. Sync conflict policy

When iPads sync at end of event:
- Unique key: `(event_id, stage_id, competitor_id)` for stages
- **First sync wins.** Second sync writes loser to `match_sync_conflicts` with original payload preserved
- Jury reviews conflicts post-sync, can supersede via the same `supersedes_id` mechanism
- No silent overwrites ever

---

## 15. Verification gate (mandatory before v3.0 ship)

1. **Smoke test** — `pocketbase.exe serve` → fresh DB → admin UI loads
2. **Import replay** — `Squadding.html` → 109 competitors / 109 squads / 4 divisions exact
3. **Scoring replay** — `run-results.csv` + `stage-1-results.csv` → 156/156 ranking match
4. **End-to-end LAN test** — phone on Beryl LAN, host with WAN unplugged. 3 competitors × 2 stages including DNS, edit-with-reason, and end-of-event sync
5. **14-hour soak** — 110 competitors, ~2 mutations/sec sustained
6. **Power-loss test** — kill server at 10 different points, verify WAL recovery clean
7. **iPad cert trust round-trip** — install mkcert CA, install PWA, confirm offline survives Safari background eviction
8. **Cascading interval test** — schedule 110 competitors with 5-min interval, group slots 5-7, verify slot 8 starts at correct time and downstream cascades correctly
9. **Contrast audit** — every text/background pair in §12 token system tested against WCAG AA minimum; CTA buttons against AAA

---

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Stage iPad lost or destroyed mid-event | Three backup layers (paper, Files-app JSON, post-sync) |
| Catalog change after tablet bootstrap | Re-bootstrap on LAN before redeploying tablet. Mid-event catalog changes documented as not supported. |
| Wrong score overwrites correct score | Append-only event sourcing — originals always recoverable |
| Tablet IndexedDB evicted by Safari | "Add to Home Screen" PWA install mandatory pre-event |
| Self-signed cert friction on iPads | One-time mkcert CA install, ~5 min, documented with screenshots |
| Single-host failure | Periodic backups every 5 min during active. Worst case: lose ≤ 5 min of run/check-in data. Stage data still on iPads. |
| Power loss mid-write | WAL mode + Pocketbase atomic transactions. Verified by power-loss test. |
| Volunteer changes between events | Quick-start card + 1-page operator cheat sheet remain mandatory |
| Bib collision (same SSSL twice) | Database UNIQUE constraint catches at import. Operator must resolve before import completes. |
| Color confusion under night-adapted vision | Status colors use both color AND shape/text — not color alone |

---

## 17. Build phases

### Phase 1 — Foundation (1–2 weeks)
- Pocketbase scaffold, mkcert TLS, Dark Industrial + Twilight `tokens.css`, font bundle
- Schema deployed via Pocketbase admin → exported to JSON for version control
- React + Vite + Tailwind frontend skeleton with theme applied
- Service worker + IndexedDB queue scaffolding
- Default catalogs seeded
- Component library: buttons (action/info/ghost), cards, tables, status badges per §12

### Phase 2 — Ingest and Setup (1 week)
- PractiScore CSV import with Approval Status filter
- PractiScore HTML squadding parser
- Bib assignment in SSSL format
- Stage and obstacle station configuration UI
- Per-stage and per-station catalog editing
- Run schedule generator with cascading interval
- PDF outputs: schedule, paper backup sheets

### Phase 3 — Operator Surfaces (2 weeks)
- Check-in (host laptop + check-in tablet)
- Start/finish line (host laptop)
- Stage tablet flow (5 screens, edit history, append-only writes)
- Obstacle tablet flow
- Files-app JSON export per tablet

### Phase 4 — Sync, Jury, Results (1 week)
- End-of-event sync endpoints
- Jury page: history viewer, supersede with reason, conflict resolution
- Scoring engine in JS hooks
- Per-division leaderboards
- Spectator live display via Pocketbase realtime
- Event close + zipped archive

### Phase 5 — Hardening (1 week)
- Online Backup API on schedule
- Audit log CSV export
- Range-officer printable score sheet
- Verification gate execution (including contrast audit)
- Operators guide + quick-start card v3 (PDF)

**Total estimate: 6–7 weeks part-time for one engineer.**

---

## 18. Pointers to source/reference material

| Item | Location |
|---|---|
| v2 schema + DDL (legacy reference) | `biathlon-app/shared/schema-match.ts` |
| v2 storage layer | `biathlon-app/server/match-storage.ts` |
| v2 squadding HTML parser (verified) | `biathlon-app/client/src/lib/parseSquaddingHtml.ts` |
| Verified scoring fixtures | `run-results.csv`, `stage-1-results.csv` |
| PractiScore reference HTML | `Squadding.html` |
| Twilight brand guide (identity layer) | `twilight-brand-guide.md` |
| Dark Industrial brand framework (structural) | `dark-brand-style-guide.md` |
| Original v3 plan (superseded) | `RNG_Ops_v3_Plan_and_Constraints.md` |
| Original spec (superseded) | `RNG-Ops-Complete-Spec.md` |
| Twilight Biathlon site | https://twilightbiathlon.com |

---

*End of project memory. Spec is locked. Build can begin at Phase 1.*
