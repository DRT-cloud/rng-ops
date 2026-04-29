# RNG Ops v3 — Workspace

The v3 rebuild of RNG Ops, a range operations console for run-and-gun
biathlon-style matches. Stack: Pocketbase 0.37.x + React 18 + Vite +
Tailwind v3 + a service worker + IndexedDB write queue. Designed to run
fully offline at events on a Windows host laptop, with iPads as stage
devices on a private LAN. The v2 codebase (Electron, Express, etc.) is
preserved at the repo root as the historical reference and porting source
documented in `docs/RNG_Ops_v3_Project_Memory.md` §18.

---

## Architecture

```
rng-ops/                    repo root
├── pocketbase.exe          single-binary backend, runs at repo root
├── pb_hooks/               JS hooks (scoring, import, sync conflict)
├── pb_migrations/          schema as code; *_init_collections.js + views
│   └── _schema_snapshot.json   human-readable mirror, update with every migration
├── pb_data/                runtime data (gitignored)
├── pb_public/              Vite build output, served by Pocketbase (gitignored)
└── v3/                     ← this workspace
    ├── README.md           you are here
    ├── package.json        Vite + React + dep pinning
    ├── vite.config.ts      multi-input rollup (app + service worker)
    ├── tailwind.config.ts  token-backed Tailwind theme
    ├── theme/
    │   ├── tokens.css      Dark Industrial framework + Twilight identity
    │   └── fonts.css       local @fontsource imports (no CDN per C2)
    ├── app/
    │   ├── index.html      Vite entry, manifest link, theme-color meta
    │   ├── public/
    │   │   └── manifest.webmanifest    PWA manifest (placeholder icons)
    │   └── src/
    │       ├── main.tsx                React mount + SW register + IDB expose
    │       ├── App.tsx                 Phase 1 primitive fixture (purge canary)
    │       ├── styles.css              Tailwind directives
    │       ├── sw.ts                   service worker (pass-through, Phase 1)
    │       ├── components/ui/          Button, Card, Table, StatusBadge
    │       └── lib/
    │           ├── cn.ts               clsx + tailwind-merge
    │           ├── idb.ts              IndexedDB write queue + meta store
    │           └── sw-register.ts      dev-skipped, prod-registered
    ├── scripts/
    │   ├── mkcert-setup.ps1            opt-in CA install + LAN cert generation
    │   └── dev.ps1                     opt-in PB+Vite parallel dev runner
    └── certs/                          mkcert output (gitignored)
```

---

## Prerequisites

- **Windows 11** (host laptop assumption per project memory §3)
- **Node 20 LTS**
- **Git**
- **mkcert** at `C:\Tools\mkcert.exe` (or anywhere on `PATH`)
- **Pocketbase 0.37.x** as `./pocketbase.exe` at the repo root

---

## First-time setup

```powershell
# 1. Clone and switch to the v3 branch
git clone <repo>
cd rng-ops
git checkout v3

# 2. Install the mkcert root CA and generate a LAN cert pair (one-time per host)
pwsh.exe -ExecutionPolicy Bypass -File v3\scripts\mkcert-setup.ps1
# Will prompt before modifying the Windows trust store.
# Use -Force on re-runs to bypass the prompt.

# 3. Install Node deps
cd v3
npm install
```

Optional but recommended: read `docs/RNG_Ops_v3_Project_Memory.md` for
the full locked spec (schema, scoring model, branding, build phases,
verification gate).

---

## Daily dev workflow

```powershell
# From repo root — starts Pocketbase + Vite together, Ctrl+C cleans both
pwsh.exe -ExecutionPolicy Bypass -File v3\scripts\dev.ps1
```

URLs:

- **Vite dev (HMR):** http://localhost:5174/
- **Pocketbase admin:** http://localhost:8090/_/
- **Pocketbase REST:** http://localhost:8090/api/

`dev.ps1` runs HTTP-only by design; the rationale is in the script
header. Localhost doesn't need TLS for service workers, the dev SW is
intentionally skipped via `import.meta.env.DEV` in `sw-register.ts`,
and the cert pair from `mkcert-setup.ps1` is reserved for Phase 5
production deployment scripting.

**Three workflow modes — don't confuse them:**

| Command | Purpose | What it serves |
|---|---|---|
| `npm run dev` (or `dev.ps1`) | Active development with HMR | Vite source, no build |
| `npm run build` | Production build | Emits to `pb_public/` |
| `npm run preview` | Test prod bundle locally | Serves `pb_public/` from :4173 |

---

## Production build

```powershell
cd v3
npm run build      # tsc -b && vite build → ../pb_public/
npm run preview    # http://localhost:4173/, prod bundle
```

Build emits both the React app and the service worker (as `/sw.js` at
the bundle root) per `vite.config.ts` rollupOptions. A `closeBundle`
plugin asserts `pb_public/sw.js` exists and is non-empty after each
build; the build fails loud if the SW disappears.

End-to-end production deployment scripting (the operator-facing
`serve.ps1` that runs Pocketbase against the built `pb_public/` over
HTTPS for iPads on LAN) is Phase 5 work and not yet implemented.

---

## Schema and migrations

- `pb_migrations/*.js` are JS migrations applied by Pocketbase on
  startup. Down migrations should also work — verified for the Phase 1
  set as part of Step C and the schema-correction commit.
- `pb_migrations/_schema_snapshot.json` is a hand-curated mirror so
  `git diff` surfaces schema changes without running PB. Update it
  every time a migration changes.
- The header of `pb_migrations/1777334400_init_collections.js` is the
  canonical reference for number-field conventions, the PB 0.23+
  0-as-blank quirk, and the 1-indexed `sort_order` / `sequence` rule.
  Read it before adding any new collection or number field.

---

## Key conventions (cross-references)

- **4-digit `SSSL` bib format** — squad number (2 digits) + slot
  number (2 digits), zero-padded. Project memory §13.3 / constraint C9.
- **Event-sourced score storage** — append-only writes; edits create
  a new row that supersedes the prior via `supersedes_id`. Originals
  always recoverable. §7.6–7.8 / C14.
- **Tablets record raw inputs; the laptop computes scores.** Stage
  iPads never compute hit-factor, ranking, or division-best. §5.6.
- **Generic product name "RNG Ops"** in code, page titles, audit logs.
  Twilight branding applied as theme; spectator-display text only. C4.

---

## What's where for extending

- **New collection** — add a JS migration in `pb_migrations/`, then
  update `pb_migrations/_schema_snapshot.json` to mirror it. Verify
  with `pocketbase.exe migrate up` against a throwaway data dir.
- **New scoring rule or import parser** — `pb_hooks/*.pb.js`. Phase 4
  builds the scoring engine here. Hook tags must match collection
  names exactly; cross-fire is silent and easy to miss.
- **New UI primitive** — add to `v3/app/src/components/ui/` and render
  every variant in `v3/app/src/App.tsx`. The fixture is the Tailwind
  purge canary; missing variants get purged from the production CSS.
  Header comment in `App.tsx` documents this invariant.
- **New screen** — first real screen lands in Phase 3. At that point
  `App.tsx` becomes the router root; the fixture moves to
  `v3/app/src/dev/Fixture.tsx` on a `import.meta.env.DEV`-gated
  `/dev/fixture` route.

---

## Documentation hierarchy

| Document | Scope |
|---|---|
| **This README** | How to **use** the v3 workspace |
| `docs/RNG_Ops_v3_Project_Memory.md` | **What** the system is + **why** decisions were made (locked spec) |
| `docs/twilight-brand-guide.md` | Twilight identity layer (logo, NV Green, fonts) |
| `docs/dark-brand-style-guide.md` | Dark Industrial framework (structural conventions) |
| `pb_migrations/1777334400_init_collections.js` header | Canonical schema conventions (0-as-blank, autodate, 1-indexed) |
| In-source code comments | Implementation details + phase-tagged TODOs |

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `mkcert not found` when running setup | Install per project memory §3; ensure `C:\Tools` is on `PATH` or mkcert is installed elsewhere on `PATH` |
| Browser shows cert warning on Pocketbase admin | Run `v3\scripts\mkcert-setup.ps1` once to install the local CA |
| Service worker won't register on iPad | iPad must trust the mkcert root CA. Phase 5 ops guide will document the install path; not yet automated |
| `npm run build` emits zero CSS for some Tailwind classes | The class isn't rendered in `App.tsx`'s primitive fixture. Tailwind's purge dropped it. Render every variant of every primitive in the fixture |
| Migrations rejected with `cannot be blank` on a number field | The PB 0.23+ 0-as-blank quirk. Either flip the field to `required: false` or use a 1-indexed convention. See `pb_migrations/1777334400_init_collections.js` header |
| Dev server can't bind `:5174` or `:8090` | Stale process from a prior run. `Get-Process pocketbase,node` then `Stop-Process` the offenders |
| `vite preview` 404s on root | `pb_public/` is empty. Run `npm run build` first |
