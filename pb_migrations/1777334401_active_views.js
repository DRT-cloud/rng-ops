/// <reference path="../pb_data/types.d.ts" />

/**
 * RNG Ops v3 — active-score views.
 * Source of truth: docs/RNG_Ops_v3_Project_Memory.md §7.10.
 *
 * Each view filters its underlying event-sourced table for rows where
 * `superseded_at_ms IS NULL` — i.e. the currently-active record per logical
 * key. PB requires explicit column lists in viewQuery (not SELECT *).
 */

migrate(
  (app) => {
    const stageView = new Collection({
      type: "view",
      name: "v_active_stage_scores",
      viewQuery: `
        SELECT id, event, stage, competitor,
               wait_seconds, raw_seconds, dns, selections_json,
               recorded_device_id, recorded_by, recorded_at_ms, synced_at_ms,
               supersedes, superseded_at_ms, edit_reason
        FROM match_stage_score_events
        WHERE superseded_at_ms IS NULL
      `,
    });
    app.save(stageView);

    const obstacleView = new Collection({
      type: "view",
      name: "v_active_obstacle_scores",
      viewQuery: `
        SELECT id, event, obstacle_station, competitor,
               selections_json,
               recorded_device_id, recorded_by, recorded_at_ms, synced_at_ms,
               supersedes, superseded_at_ms, edit_reason
        FROM match_obstacle_score_events
        WHERE superseded_at_ms IS NULL
      `,
    });
    app.save(obstacleView);

    const runView = new Collection({
      type: "view",
      name: "v_active_run_records",
      viewQuery: `
        SELECT id, event, competitor,
               start_ms, finish_ms, status,
               recorded_device_id, recorded_by, recorded_at_ms,
               supersedes, superseded_at_ms, edit_reason
        FROM match_run_events
        WHERE superseded_at_ms IS NULL
      `,
    });
    app.save(runView);
  },
  (app) => {
    for (const name of ["v_active_run_records", "v_active_obstacle_scores", "v_active_stage_scores"]) {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (_e) {
        // already removed
      }
    }
  },
);
