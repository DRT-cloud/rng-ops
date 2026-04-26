/**
 * Match scoring schema (Phase 2 rebuild).
 *
 * Tables for the multi-stage shooting/obstacle race scoring model:
 *   match_events   - top-level event (one row per match)
 *   match_divisions - divisions within a match (2G, PCC, etc.)
 *   match_stages   - stages with configurable max points
 *   match_obstacles - obstacles
 *   match_pen_types - penalty types per stage OR per obstacle
 *   match_bon_types - bonus types per stage OR per obstacle
 *   match_competitors - one row per division entry (a human running 3 divisions = 3 rows)
 *   match_run_records - run start/finish per competitor
 *   match_stage_records - per (competitor, stage) raw time + wait + status
 *   match_stage_pen_counts - per (competitor, stage_pen_type) count
 *   match_stage_bon_counts - per (competitor, stage_bon_type) count
 *   match_obstacle_pen_counts - per (competitor, obstacle_pen_type) count
 *   match_obstacle_bon_counts - per (competitor, obstacle_bon_type) count
 *
 * All tables prefixed `match_` to coexist with the legacy biathlon schema
 * during transition.
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// -----------------------------------------------------------------------------
// Tables
// -----------------------------------------------------------------------------

export const matchEvents = sqliteTable('match_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  eventDate: text('event_date').notNull(), // YYYY-MM-DD
  runMaxPoints: integer('run_max_points').notNull().default(400),
  isActive: integer('is_active').notNull().default(0), // boolean: which event the app is currently running
  createdAt: text('created_at').notNull(),
});

export const matchDivisions = sqliteTable('match_divisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  code: text('code').notNull(),       // "2G"
  name: text('name').notNull(),       // "Two-Gun Open"
  sortOrder: integer('sort_order').notNull().default(0),
});

export const matchStages = sqliteTable('match_stages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  name: text('name').notNull(),
  sequence: integer('sequence').notNull(),
  maxPoints: integer('max_points').notNull().default(100),
});

export const matchObstacles = sqliteTable('match_obstacles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  name: text('name').notNull(),
  sequence: integer('sequence').notNull(),
});

/** Penalty type. owner_kind = 'stage' | 'obstacle'; owner_id references stages.id or obstacles.id. */
export const matchPenTypes = sqliteTable('match_pen_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerKind: text('owner_kind').notNull(), // 'stage' | 'obstacle'
  ownerId: integer('owner_id').notNull(),
  name: text('name').notNull(),
  seconds: real('seconds').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** Bonus type. Same shape as penalty type but seconds is subtracted. */
export const matchBonTypes = sqliteTable('match_bon_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerKind: text('owner_kind').notNull(),
  ownerId: integer('owner_id').notNull(),
  name: text('name').notNull(),
  seconds: real('seconds').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const matchCompetitors = sqliteTable('match_competitors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  bib: text('bib').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  divisionId: integer('division_id').notNull(),
  /** Match-level status: 'registered' | 'checked_in' | 'no_show' | 'dq'. */
  status: text('status').notNull().default('registered'),
  notes: text('notes'),
});

export const matchRunRecords = sqliteTable('match_run_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  competitorId: integer('competitor_id').notNull().unique(),
  /** Epoch ms; null until recorded. */
  startMs: integer('start_ms'),
  /** Epoch ms; null until recorded. */
  finishMs: integer('finish_ms'),
  /** 'ok' | 'no_show' | 'dq'. */
  status: text('status').notNull().default('ok'),
});

export const matchStageRecords = sqliteTable('match_stage_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  competitorId: integer('competitor_id').notNull(),
  stageId: integer('stage_id').notNull(),
  /** Decimal seconds (e.g. 39.57). Null when no_show / dq. */
  rawTimeSeconds: real('raw_time_seconds'),
  /** Decimal seconds; UI captures MM:SS and stores seconds. */
  waitTimeSeconds: real('wait_time_seconds').notNull().default(0),
  /** 'ok' | 'no_show' | 'dq'. */
  status: text('status').notNull().default('ok'),
  updatedAt: text('updated_at').notNull(),
});

/** Count of how many times a stage penalty was applied to a (competitor, stage). */
export const matchStagePenCounts = sqliteTable('match_stage_pen_counts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  competitorId: integer('competitor_id').notNull(),
  penTypeId: integer('pen_type_id').notNull(),
  count: integer('count').notNull().default(0),
});

export const matchStageBonCounts = sqliteTable('match_stage_bon_counts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  competitorId: integer('competitor_id').notNull(),
  bonTypeId: integer('bon_type_id').notNull(),
  count: integer('count').notNull().default(0),
});

export const matchObstaclePenCounts = sqliteTable('match_obstacle_pen_counts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  competitorId: integer('competitor_id').notNull(),
  penTypeId: integer('pen_type_id').notNull(),
  count: integer('count').notNull().default(0),
});

export const matchObstacleBonCounts = sqliteTable('match_obstacle_bon_counts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  competitorId: integer('competitor_id').notNull(),
  bonTypeId: integer('bon_type_id').notNull(),
  count: integer('count').notNull().default(0),
});

// -----------------------------------------------------------------------------
// Inferred types
// -----------------------------------------------------------------------------

export type MatchEvent = typeof matchEvents.$inferSelect;
export type MatchDivision = typeof matchDivisions.$inferSelect;
export type MatchStage = typeof matchStages.$inferSelect;
export type MatchObstacle = typeof matchObstacles.$inferSelect;
export type MatchPenType = typeof matchPenTypes.$inferSelect;
export type MatchBonType = typeof matchBonTypes.$inferSelect;
export type MatchCompetitor = typeof matchCompetitors.$inferSelect;
export type MatchRunRecord = typeof matchRunRecords.$inferSelect;
export type MatchStageRecord = typeof matchStageRecords.$inferSelect;

export type InsertMatchEvent = typeof matchEvents.$inferInsert;
export type InsertMatchDivision = typeof matchDivisions.$inferInsert;
export type InsertMatchStage = typeof matchStages.$inferInsert;
export type InsertMatchObstacle = typeof matchObstacles.$inferInsert;
export type InsertMatchPenType = typeof matchPenTypes.$inferInsert;
export type InsertMatchBonType = typeof matchBonTypes.$inferInsert;
export type InsertMatchCompetitor = typeof matchCompetitors.$inferInsert;
export type InsertMatchRunRecord = typeof matchRunRecords.$inferInsert;
export type InsertMatchStageRecord = typeof matchStageRecords.$inferInsert;

// -----------------------------------------------------------------------------
// DDL — single source of truth for table creation, used by storage init.
// -----------------------------------------------------------------------------

export const MATCH_DDL = `
CREATE TABLE IF NOT EXISTS match_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  run_max_points INTEGER NOT NULL DEFAULT 400,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_divisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS match_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  max_points INTEGER NOT NULL DEFAULT 100
);
CREATE TABLE IF NOT EXISTS match_obstacles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS match_pen_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_kind TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  seconds REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS match_bon_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_kind TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  seconds REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS match_competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  bib TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  division_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered',
  notes TEXT
);
CREATE TABLE IF NOT EXISTS match_run_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL UNIQUE,
  start_ms INTEGER,
  finish_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'ok'
);
CREATE TABLE IF NOT EXISTS match_stage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL,
  stage_id INTEGER NOT NULL,
  raw_time_seconds REAL,
  wait_time_seconds REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  updated_at TEXT NOT NULL,
  UNIQUE(competitor_id, stage_id)
);
CREATE TABLE IF NOT EXISTS match_stage_pen_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL,
  pen_type_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(competitor_id, pen_type_id)
);
CREATE TABLE IF NOT EXISTS match_stage_bon_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL,
  bon_type_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(competitor_id, bon_type_id)
);
CREATE TABLE IF NOT EXISTS match_obstacle_pen_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL,
  pen_type_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(competitor_id, pen_type_id)
);
CREATE TABLE IF NOT EXISTS match_obstacle_bon_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL,
  bon_type_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(competitor_id, bon_type_id)
);
CREATE INDEX IF NOT EXISTS ix_match_competitors_event ON match_competitors(event_id);
CREATE INDEX IF NOT EXISTS ix_match_competitors_div ON match_competitors(division_id);
CREATE INDEX IF NOT EXISTS ix_match_stages_event ON match_stages(event_id, sequence);
CREATE INDEX IF NOT EXISTS ix_match_obstacles_event ON match_obstacles(event_id, sequence);
CREATE INDEX IF NOT EXISTS ix_match_stage_records_comp ON match_stage_records(competitor_id);
CREATE INDEX IF NOT EXISTS ix_match_stage_records_stage ON match_stage_records(stage_id);
CREATE INDEX IF NOT EXISTS ix_match_pen_owner ON match_pen_types(owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS ix_match_bon_owner ON match_bon_types(owner_kind, owner_id);
`;
