/// <reference path="../pb_data/types.d.ts" />

/**
 * RNG Ops v3 — initial schema.
 * Source of truth: docs/RNG_Ops_v3_Project_Memory.md §7.1–7.9.
 *
 * Order respects relation FK dependencies:
 *   events → divisions, stages, obstacle_stations, audit, sync_conflicts
 *   stages → stage_catalog, stage_score_events
 *   obstacle_stations → obstacle_catalog, obstacle_score_events
 *   competitors → squads, run_schedule, run_events, *_score_events
 *
 * Self-referential `supersedes` relations (event-sourced tables in §7.6–7.8)
 * are added in a second pass once the parent collection's id is known.
 *
 * Naming note: §7 spec uses `event_id`, `stage_id`, etc. PB convention names
 * relation fields without the `_id` suffix; the underlying SQL column matches
 * the field name. Effective SQL columns are `event`, `stage`, `competitor`, …
 *
 * API note (PocketBase 0.37.4 JSVM, verified empirically):
 *   - Collection constructor `fields:` array MUST use plain objects.
 *     Typed Field instances (e.g. `new TextField({...})`) inside the
 *     constructor are silently dropped — only `id` survives.
 *   - `collection.fields.add(...)` MUST use a typed Field instance.
 *     A plain object errors with "could not convert [object Object] to
 *     core.Field". This is why the pass-2 self-referential `supersedes`
 *     relations use `new RelationField({...})`.
 *
 * PB version note: this migration was verified against PB 0.37.4.
 * Behavior change vs. 0.22: PB 0.23+ does NOT auto-create `created`/`updated`
 * columns. Tables that need either column must declare an `autodate` field
 * explicitly. Only match_events and match_audit need `created_at` per §7.1
 * and §7.9 of the project memory; score event tables use `recorded_at_ms`
 * instead and do not need autodate.
 *
 * PB version note (0-as-blank quirk + canonical number-field conventions):
 *
 * PB 0.23+ rejects the value 0 on a `required: true, type: "number"` field
 * with "cannot be blank". Fields that legitimately need to store 0 must be
 * either (a) `required: false` so the app layer can distinguish unset from
 * zero, or (b) treated as 1-indexed by convention. Use this section as the
 * canonical reference when adding any number field in a future migration.
 *
 * 1-indexed by convention (display ordering, sequence, slot counters):
 *   - match_divisions.sort_order        min: 1, required: true
 *   - match_stages.sort_order           min: 1, required: true
 *   - match_obstacle_stations.sort_order min: 1, required: true
 *   - match_stage_catalog.sort_order    min: 1, required: true
 *   - match_obstacle_catalog.sort_order min: 1, required: true
 *   - match_squads.slot_number          min: 1, required: true (per spec sample data)
 *   - match_run_schedule.group_size     min: 1, required: true
 *   - match_run_schedule.sequence       min: 1, required: true
 *
 * The seed hook (pb_hooks/seed_default_catalogs.pb.js) emits sort_order: 1
 * for the default catalog row; operator-added entries should start at 2+.
 *
 * Convention for match_run_schedule.start_group_id (required: false): group
 * ids start at 1; null means "ungrouped, leaves alone". Step E's run-
 * schedule generator should follow this when emitting start_group_id.
 *
 * Flipped to required: false so 0 is a legitimate operator-chosen value:
 *   - match_events.default_interval_seconds         (0 = no spacing between starts)
 *   - match_events.default_obstacle_penalty_seconds (0 = no default penalty)
 *
 * Saved-by-domain exceptions — fields that keep required: true even though
 * PB rejects 0, because 0 is unreachable or invalid in their domain. This
 * is NOT a pattern to copy in future migrations:
 *   - match_*_score_events.recorded_at_ms / match_run_events.recorded_at_ms
 *     and match_run_schedule.scheduled_at_ms — epoch milliseconds; 0 is
 *     1970-01-01 and unreachable in practice.
 *   - match_stage_catalog.seconds, match_obstacle_catalog.seconds — a
 *     catalog entry that doesn't change time is useless data, regardless
 *     of penalty vs. bonus kind. NOT min:1 — fractional values like 0.5
 *     remain valid.
 *
 * Future rule: if a new number field could legitimately be 0 (relative
 * offsets, counts, durations a user might choose to zero out), declare
 * it required: false. Do not rely on the saved-by-domain exception above.
 */

migrate(
  (app) => {
    const STATUS_EVENT = ["pending", "active", "data_collection", "closed"];
    const STATUS_COMPETITOR = ["registered", "checked_in", "late_arrival", "no_show", "withdrawn"];
    const STATUS_RUN = ["ok", "no_show"];
    const KIND = ["penalty", "bonus"];

    // ---------- 1. match_events ----------
    // `created` autodate satisfies §7.1 `created_at`. Required because PB
    // 0.23+ no longer auto-creates the column.
    const events = new Collection({
      type: "base",
      name: "match_events",
      fields: [
        { name: "name", type: "text", required: true, max: 200 },
        { name: "event_date", type: "date", required: true },
        { name: "start_time", type: "text", required: false, max: 8 },
        { name: "default_interval_seconds", type: "number", required: false, min: 0 },
        { name: "default_obstacle_penalty_seconds", type: "number", required: false, min: 0 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: STATUS_EVENT },
        { name: "backup_path", type: "text", required: false, max: 500 },
        { name: "created", type: "autodate", onCreate: true },
      ],
    });
    app.save(events);

    // ---------- 2. match_divisions ----------
    const divisions = new Collection({
      type: "base",
      name: "match_divisions",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "code", type: "text", required: true, max: 50 },
        { name: "name", type: "text", required: true, max: 100 },
        { name: "sort_order", type: "number", required: true, min: 1 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_match_divisions_event_code` ON `match_divisions` (`event`, `code`)",
      ],
    });
    app.save(divisions);

    // ---------- 3. match_stages ----------
    const stages = new Collection({
      type: "base",
      name: "match_stages",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "code", type: "text", required: true, max: 50 },
        { name: "name", type: "text", required: true, max: 100 },
        { name: "sort_order", type: "number", required: true, min: 1 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_match_stages_event_code` ON `match_stages` (`event`, `code`)",
      ],
    });
    app.save(stages);

    // ---------- 4. match_obstacle_stations ----------
    const obstacleStations = new Collection({
      type: "base",
      name: "match_obstacle_stations",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "code", type: "text", required: true, max: 50 },
        { name: "name", type: "text", required: true, max: 100 },
        { name: "sort_order", type: "number", required: true, min: 1 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_match_obstacle_stations_event_code` ON `match_obstacle_stations` (`event`, `code`)",
      ],
    });
    app.save(obstacleStations);

    // ---------- 5. match_stage_catalog ----------
    const stageCatalog = new Collection({
      type: "base",
      name: "match_stage_catalog",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "stage", type: "relation", required: true, collectionId: stages.id, cascadeDelete: true, maxSelect: 1 },
        { name: "code", type: "text", required: true, max: 50 },
        { name: "label", type: "text", required: true, max: 100 },
        { name: "seconds", type: "number", required: true },
        { name: "kind", type: "select", required: true, maxSelect: 1, values: KIND },
        { name: "sort_order", type: "number", required: true, min: 1 },
        { name: "is_active", type: "bool", required: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_match_stage_catalog_event_stage_code` ON `match_stage_catalog` (`event`, `stage`, `code`)",
      ],
    });
    app.save(stageCatalog);

    // ---------- 6. match_obstacle_catalog ----------
    const obstacleCatalog = new Collection({
      type: "base",
      name: "match_obstacle_catalog",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "obstacle_station", type: "relation", required: true, collectionId: obstacleStations.id, cascadeDelete: true, maxSelect: 1 },
        { name: "code", type: "text", required: true, max: 50 },
        { name: "label", type: "text", required: true, max: 100 },
        { name: "seconds", type: "number", required: true },
        { name: "kind", type: "select", required: true, maxSelect: 1, values: KIND },
        { name: "sort_order", type: "number", required: true, min: 1 },
        { name: "is_active", type: "bool", required: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_match_obstacle_catalog_event_station_code` ON `match_obstacle_catalog` (`event`, `obstacle_station`, `code`)",
      ],
    });
    app.save(obstacleCatalog);

    // ---------- 7. match_competitors (4-digit SSSL bib enforced via pattern) ----------
    const competitors = new Collection({
      type: "base",
      name: "match_competitors",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "bib", type: "text", required: true, min: 4, max: 4, pattern: "^\\d{4}$" },
        { name: "first_name", type: "text", required: true, max: 100 },
        { name: "last_name", type: "text", required: true, max: 100 },
        { name: "division", type: "relation", required: true, collectionId: divisions.id, cascadeDelete: false, maxSelect: 1 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: STATUS_COMPETITOR },
        { name: "shooter_id", type: "text", required: false, max: 100 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_match_competitors_event_bib` ON `match_competitors` (`event`, `bib`)",
      ],
    });
    app.save(competitors);

    // ---------- 8. match_squads ----------
    const squads = new Collection({
      type: "base",
      name: "match_squads",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "competitor", type: "relation", required: true, collectionId: competitors.id, cascadeDelete: true, maxSelect: 1 },
        { name: "day", type: "number", required: false, min: 1 },
        { name: "bay", type: "text", required: false, max: 50 },
        { name: "time_start", type: "text", required: false, max: 8 },
        { name: "time_end", type: "text", required: false, max: 8 },
        { name: "slot_number", type: "number", required: true, min: 1 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_match_squads_event_competitor` ON `match_squads` (`event`, `competitor`)",
      ],
    });
    app.save(squads);

    // ---------- 9. match_run_schedule ----------
    const runSchedule = new Collection({
      type: "base",
      name: "match_run_schedule",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "competitor", type: "relation", required: true, collectionId: competitors.id, cascadeDelete: true, maxSelect: 1 },
        { name: "scheduled_at_ms", type: "number", required: true },
        { name: "start_group_id", type: "number", required: false },
        { name: "group_size", type: "number", required: true, min: 1 },
        { name: "sequence", type: "number", required: true, min: 1 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_match_run_schedule_event_competitor` ON `match_run_schedule` (`event`, `competitor`)",
      ],
    });
    app.save(runSchedule);

    // ---------- 10. match_run_events (event-sourced; supersedes added in pass 2) ----------
    // recorded_device_id and recorded_by are NOT required at the DB layer:
    // opening-morning blank IndexedDB / fresh tablet must not be blocked from
    // recording the first run. Application layer defaults blanks to "unset" /
    // "unknown" before write.
    const runEvents = new Collection({
      type: "base",
      name: "match_run_events",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "competitor", type: "relation", required: true, collectionId: competitors.id, cascadeDelete: true, maxSelect: 1 },
        { name: "start_ms", type: "number", required: false },
        { name: "finish_ms", type: "number", required: false },
        { name: "status", type: "select", required: true, maxSelect: 1, values: STATUS_RUN },
        { name: "recorded_device_id", type: "text", required: false, max: 100 },
        { name: "recorded_by", type: "text", required: false, max: 100 },
        { name: "recorded_at_ms", type: "number", required: true },
        { name: "superseded_at_ms", type: "number", required: false },
        { name: "edit_reason", type: "text", required: false, max: 500 },
      ],
      indexes: [
        "CREATE INDEX `idx_match_run_events_superseded_at_ms` ON `match_run_events` (`superseded_at_ms`)",
      ],
    });
    app.save(runEvents);

    // ---------- 11. match_stage_score_events ----------
    // recorded_device_id / recorded_by required: false — see note on runEvents.
    const stageScoreEvents = new Collection({
      type: "base",
      name: "match_stage_score_events",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "stage", type: "relation", required: true, collectionId: stages.id, cascadeDelete: true, maxSelect: 1 },
        { name: "competitor", type: "relation", required: true, collectionId: competitors.id, cascadeDelete: true, maxSelect: 1 },
        { name: "wait_seconds", type: "number", required: false, min: 0 },
        { name: "raw_seconds", type: "number", required: false, min: 0 },
        { name: "dns", type: "bool", required: false },
        { name: "selections_json", type: "json", required: false, maxSize: 50000 },
        { name: "recorded_device_id", type: "text", required: false, max: 100 },
        { name: "recorded_by", type: "text", required: false, max: 100 },
        { name: "recorded_at_ms", type: "number", required: true },
        { name: "synced_at_ms", type: "number", required: false },
        { name: "superseded_at_ms", type: "number", required: false },
        { name: "edit_reason", type: "text", required: false, max: 500 },
      ],
      indexes: [
        "CREATE INDEX `idx_match_stage_score_events_superseded_at_ms` ON `match_stage_score_events` (`superseded_at_ms`)",
      ],
    });
    app.save(stageScoreEvents);

    // ---------- 12. match_obstacle_score_events ----------
    // recorded_device_id / recorded_by required: false — see note on runEvents.
    const obstacleScoreEvents = new Collection({
      type: "base",
      name: "match_obstacle_score_events",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "obstacle_station", type: "relation", required: true, collectionId: obstacleStations.id, cascadeDelete: true, maxSelect: 1 },
        { name: "competitor", type: "relation", required: true, collectionId: competitors.id, cascadeDelete: true, maxSelect: 1 },
        { name: "selections_json", type: "json", required: false, maxSize: 50000 },
        { name: "recorded_device_id", type: "text", required: false, max: 100 },
        { name: "recorded_by", type: "text", required: false, max: 100 },
        { name: "recorded_at_ms", type: "number", required: true },
        { name: "synced_at_ms", type: "number", required: false },
        { name: "superseded_at_ms", type: "number", required: false },
        { name: "edit_reason", type: "text", required: false, max: 500 },
      ],
      indexes: [
        "CREATE INDEX `idx_match_obstacle_score_events_superseded_at_ms` ON `match_obstacle_score_events` (`superseded_at_ms`)",
      ],
    });
    app.save(obstacleScoreEvents);

    // ---------- 13. match_audit ----------
    // `created` autodate satisfies §7.9 `created_at`.
    const audit = new Collection({
      type: "base",
      name: "match_audit",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "actor", type: "text", required: true, max: 100 },
        { name: "actor_role", type: "text", required: false, max: 50 },
        { name: "actor_device_id", type: "text", required: false, max: 100 },
        { name: "action", type: "text", required: true, max: 200 },
        { name: "payload_json", type: "json", required: false, maxSize: 100000 },
        { name: "created", type: "autodate", onCreate: true },
      ],
    });
    app.save(audit);

    // ---------- 14. match_sync_conflicts ----------
    const syncConflicts = new Collection({
      type: "base",
      name: "match_sync_conflicts",
      fields: [
        { name: "event", type: "relation", required: true, collectionId: events.id, cascadeDelete: true, maxSelect: 1 },
        { name: "target_table", type: "text", required: true, max: 100 },
        { name: "target_key_json", type: "json", required: true, maxSize: 5000 },
        { name: "losing_payload_json", type: "json", required: true, maxSize: 100000 },
        { name: "reason", type: "text", required: true, max: 500 },
        { name: "resolved", type: "bool", required: false },
        { name: "resolved_by", type: "text", required: false, max: 100 },
        { name: "resolved_at_ms", type: "number", required: false },
      ],
    });
    app.save(syncConflicts);

    // ---------- Pass 2: self-referential `supersedes` on event-sourced tables ----------
    // fields.add() requires a typed Field instance (plain object errors with
    // "could not convert [object Object] to core.Field").
    runEvents.fields.add(new RelationField({
      name: "supersedes",
      required: false,
      collectionId: runEvents.id,
      maxSelect: 1,
      cascadeDelete: false,
    }));
    app.save(runEvents);

    stageScoreEvents.fields.add(new RelationField({
      name: "supersedes",
      required: false,
      collectionId: stageScoreEvents.id,
      maxSelect: 1,
      cascadeDelete: false,
    }));
    app.save(stageScoreEvents);

    obstacleScoreEvents.fields.add(new RelationField({
      name: "supersedes",
      required: false,
      collectionId: obstacleScoreEvents.id,
      maxSelect: 1,
      cascadeDelete: false,
    }));
    app.save(obstacleScoreEvents);
  },
  (app) => {
    // Reverse order to respect FK dependencies
    const names = [
      "match_sync_conflicts",
      "match_audit",
      "match_obstacle_score_events",
      "match_stage_score_events",
      "match_run_events",
      "match_run_schedule",
      "match_squads",
      "match_competitors",
      "match_obstacle_catalog",
      "match_stage_catalog",
      "match_obstacle_stations",
      "match_stages",
      "match_divisions",
      "match_events",
    ];
    for (const name of names) {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (_e) {
        // already removed; continue
      }
    }
  },
);
