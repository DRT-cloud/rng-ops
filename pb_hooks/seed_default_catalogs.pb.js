/// <reference path="../pb_data/types.d.ts" />

// SOURCE: docs/RNG_Ops_v3_Project_Memory.md §7.3 — default catalog seeds.
//
// When a new stage is created, seed match_stage_catalog with one default
// FTN penalty row. When a new obstacle station is created, seed
// match_obstacle_catalog with one default obstacle-failed penalty row.
// Operators add more entries per-stage and per-station at event setup.
//
// Idempotent: each hook checks for an existing row with the same
// (event, parent_id, code) before inserting. The migration's UNIQUE index
// on those columns would otherwise throw post-commit if the seed ever fired
// twice for the same parent (e.g. manual operator pre-seed before save,
// internal hook replay), leaving an orphaned parent and a noisy log.
//
// Hooks are registered with collection-name tags so each fires only on its
// intended parent table. Cross-firing is verified by the Step D probe test.
//
// PB 0.23+ quirk: required number fields treat the value 0 as blank and
// reject it ("cannot be blank"). Seed `sort_order` is therefore 1, not 0.
// This means operator-added catalog entries should start at sort_order 2+
// to keep the seed first in the UI chip grid ordering.

onRecordAfterCreateSuccess((e) => {
  const eventId = e.record.get("event");
  const stageId = e.record.id;

  let existing = null;
  try {
    existing = $app.findFirstRecordByFilter(
      "match_stage_catalog",
      "event = {:event} && stage = {:stage} && code = {:code}",
      { event: eventId, stage: stageId, code: "ftn" },
    );
  } catch (_) {
    // not found — proceed to insert
  }

  if (!existing) {
    const collection = $app.findCollectionByNameOrId("match_stage_catalog");
    const seed = new Record(collection, {
      event: eventId,
      stage: stageId,
      code: "ftn",
      label: "Fail to Neutralize",
      seconds: 20,
      kind: "penalty",
      sort_order: 1,
      is_active: true,
    });
    $app.save(seed);
  }

  e.next();
}, "match_stages");

onRecordAfterCreateSuccess((e) => {
  const eventId = e.record.get("event");
  const stationId = e.record.id;

  let existing = null;
  try {
    existing = $app.findFirstRecordByFilter(
      "match_obstacle_catalog",
      "event = {:event} && obstacle_station = {:station} && code = {:code}",
      { event: eventId, station: stationId, code: "obstacle_failed" },
    );
  } catch (_) {
    // not found — proceed to insert
  }

  if (!existing) {
    const collection = $app.findCollectionByNameOrId("match_obstacle_catalog");
    const seed = new Record(collection, {
      event: eventId,
      obstacle_station: stationId,
      code: "obstacle_failed",
      label: "Obstacle Failed",
      seconds: 300,
      kind: "penalty",
      sort_order: 1,
      is_active: true,
    });
    $app.save(seed);
  }

  e.next();
}, "match_obstacle_stations");
