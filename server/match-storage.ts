/**
 * Match scoring storage layer.
 *
 * Sits beside server/storage.ts on the same SQLite connection. Exports
 * matchStorage with CRUD helpers + a buildScoringInput() function that
 * assembles a ScoringInput from the DB so the engine can compute results.
 */

import Database from 'better-sqlite3';
import { MATCH_DDL } from '@shared/schema-match';
import type { ScoringInput, Stage, Obstacle, PenaltyOrBonusType } from './scoring/types';

// We import the same DB_PATH logic as server/storage.ts uses, but open our own
// handle so this module is self-contained and easier to test in isolation.
const DB_PATH = process.env.DATABASE_PATH || 'data.db';
const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.exec(MATCH_DDL);

// -----------------------------------------------------------------------------
// Row types — match SQL column names exactly (snake_case).
// -----------------------------------------------------------------------------

interface EventRow {
  id: number;
  name: string;
  event_date: string;
  run_max_points: number;
  is_active: number;
  created_at: string;
}
interface DivisionRow {
  id: number;
  event_id: number;
  code: string;
  name: string;
  sort_order: number;
}
interface StageRow {
  id: number;
  event_id: number;
  name: string;
  sequence: number;
  max_points: number;
}
interface ObstacleRow {
  id: number;
  event_id: number;
  name: string;
  sequence: number;
}
interface PenBonTypeRow {
  id: number;
  owner_kind: 'stage' | 'obstacle';
  owner_id: number;
  name: string;
  seconds: number;
  sort_order: number;
}
interface CompetitorRow {
  id: number;
  event_id: number;
  bib: string;
  first_name: string;
  last_name: string;
  division_id: number;
  status: 'registered' | 'checked_in' | 'no_show' | 'dq';
  notes: string | null;
}
interface RunRecRow {
  id: number;
  competitor_id: number;
  start_ms: number | null;
  finish_ms: number | null;
  status: 'ok' | 'no_show' | 'dq';
}
interface StageRecRow {
  id: number;
  competitor_id: number;
  stage_id: number;
  raw_time_seconds: number | null;
  wait_time_seconds: number;
  status: 'ok' | 'no_show' | 'dq';
  updated_at: string;
}
interface CountRow {
  competitor_id: number;
  pen_type_id?: number;
  bon_type_id?: number;
  count: number;
}

// -----------------------------------------------------------------------------
// Prepared statements
// -----------------------------------------------------------------------------

const stmt = {
  // Events
  insertEvent: sqlite.prepare(
    `INSERT INTO match_events (name, event_date, run_max_points, is_active, created_at)
     VALUES (@name, @eventDate, @runMaxPoints, @isActive, @createdAt)`,
  ),
  listEvents: sqlite.prepare(`SELECT * FROM match_events ORDER BY id DESC`),
  getEvent: sqlite.prepare(`SELECT * FROM match_events WHERE id = ?`),
  setActiveEvent: sqlite.prepare(
    `UPDATE match_events SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END`,
  ),
  updateEvent: sqlite.prepare(
    `UPDATE match_events SET name = @name, event_date = @eventDate, run_max_points = @runMaxPoints WHERE id = @id`,
  ),
  deleteEvent: sqlite.prepare(`DELETE FROM match_events WHERE id = ?`),

  // Divisions
  insertDivision: sqlite.prepare(
    `INSERT INTO match_divisions (event_id, code, name, sort_order)
     VALUES (@eventId, @code, @name, @sortOrder)`,
  ),
  listDivisions: sqlite.prepare(
    `SELECT * FROM match_divisions WHERE event_id = ? ORDER BY sort_order, id`,
  ),
  deleteDivision: sqlite.prepare(`DELETE FROM match_divisions WHERE id = ?`),
  deleteDivisionsByEvent: sqlite.prepare(`DELETE FROM match_divisions WHERE event_id = ?`),

  // Stages
  insertStage: sqlite.prepare(
    `INSERT INTO match_stages (event_id, name, sequence, max_points)
     VALUES (@eventId, @name, @sequence, @maxPoints)`,
  ),
  listStages: sqlite.prepare(
    `SELECT * FROM match_stages WHERE event_id = ? ORDER BY sequence, id`,
  ),
  deleteStagesByEvent: sqlite.prepare(`DELETE FROM match_stages WHERE event_id = ?`),
  deleteStage: sqlite.prepare(`DELETE FROM match_stages WHERE id = ?`),

  // Obstacles
  insertObstacle: sqlite.prepare(
    `INSERT INTO match_obstacles (event_id, name, sequence)
     VALUES (@eventId, @name, @sequence)`,
  ),
  listObstacles: sqlite.prepare(
    `SELECT * FROM match_obstacles WHERE event_id = ? ORDER BY sequence, id`,
  ),
  deleteObstaclesByEvent: sqlite.prepare(`DELETE FROM match_obstacles WHERE event_id = ?`),
  deleteObstacle: sqlite.prepare(`DELETE FROM match_obstacles WHERE id = ?`),

  // Penalty / bonus types
  insertPenType: sqlite.prepare(
    `INSERT INTO match_pen_types (owner_kind, owner_id, name, seconds, sort_order)
     VALUES (@ownerKind, @ownerId, @name, @seconds, @sortOrder)`,
  ),
  insertBonType: sqlite.prepare(
    `INSERT INTO match_bon_types (owner_kind, owner_id, name, seconds, sort_order)
     VALUES (@ownerKind, @ownerId, @name, @seconds, @sortOrder)`,
  ),
  listPenTypesForOwner: sqlite.prepare(
    `SELECT * FROM match_pen_types WHERE owner_kind = ? AND owner_id = ? ORDER BY sort_order, id`,
  ),
  listBonTypesForOwner: sqlite.prepare(
    `SELECT * FROM match_bon_types WHERE owner_kind = ? AND owner_id = ? ORDER BY sort_order, id`,
  ),
  deletePenTypesForOwner: sqlite.prepare(
    `DELETE FROM match_pen_types WHERE owner_kind = ? AND owner_id = ?`,
  ),
  deleteBonTypesForOwner: sqlite.prepare(
    `DELETE FROM match_bon_types WHERE owner_kind = ? AND owner_id = ?`,
  ),

  // Competitors
  insertCompetitor: sqlite.prepare(
    `INSERT INTO match_competitors (event_id, bib, first_name, last_name, division_id, status, notes)
     VALUES (@eventId, @bib, @firstName, @lastName, @divisionId, @status, @notes)`,
  ),
  updateCompetitor: sqlite.prepare(
    `UPDATE match_competitors SET bib = @bib, first_name = @firstName, last_name = @lastName,
       division_id = @divisionId, status = @status, notes = @notes WHERE id = @id`,
  ),
  setCompetitorStatus: sqlite.prepare(
    `UPDATE match_competitors SET status = ? WHERE id = ?`,
  ),
  listCompetitors: sqlite.prepare(
    `SELECT * FROM match_competitors WHERE event_id = ? ORDER BY bib`,
  ),
  getCompetitor: sqlite.prepare(`SELECT * FROM match_competitors WHERE id = ?`),
  deleteCompetitor: sqlite.prepare(`DELETE FROM match_competitors WHERE id = ?`),
  deleteCompetitorsByEvent: sqlite.prepare(`DELETE FROM match_competitors WHERE event_id = ?`),
  countCompetitorsWithBib: sqlite.prepare(
    `SELECT COUNT(*) AS c FROM match_competitors WHERE event_id = ? AND bib = ? AND id != ?`,
  ),
  maxCompetitorBib: sqlite.prepare(
    `SELECT MAX(CAST(bib AS INTEGER)) AS m FROM match_competitors WHERE event_id = ?`,
  ),

  // Squads (squadding import — see SetupPage)
  insertSquad: sqlite.prepare(
    `INSERT INTO match_squads (event_id, competitor_id, day, bay, time_start, time_end, slot_number)
     VALUES (@eventId, @competitorId, @day, @bay, @timeStart, @timeEnd, @slotNumber)
     ON CONFLICT(competitor_id) DO UPDATE SET
       day = excluded.day,
       bay = excluded.bay,
       time_start = excluded.time_start,
       time_end = excluded.time_end,
       slot_number = excluded.slot_number`,
  ),
  listSquads: sqlite.prepare(
    `SELECT * FROM match_squads WHERE event_id = ? ORDER BY day, bay, slot_number`,
  ),
  deleteSquadsByEvent: sqlite.prepare(`DELETE FROM match_squads WHERE event_id = ?`),

  // Run records
  upsertRunRecord: sqlite.prepare(
    `INSERT INTO match_run_records (competitor_id, start_ms, finish_ms, status)
     VALUES (@competitorId, @startMs, @finishMs, @status)
     ON CONFLICT(competitor_id) DO UPDATE SET
       start_ms = excluded.start_ms,
       finish_ms = excluded.finish_ms,
       status = excluded.status`,
  ),
  getRunRecord: sqlite.prepare(`SELECT * FROM match_run_records WHERE competitor_id = ?`),
  listRunRecords: sqlite.prepare(
    `SELECT r.* FROM match_run_records r
     JOIN match_competitors c ON c.id = r.competitor_id
     WHERE c.event_id = ?`,
  ),

  // Stage records
  upsertStageRecord: sqlite.prepare(
    `INSERT INTO match_stage_records (competitor_id, stage_id, raw_time_seconds, wait_time_seconds, status, updated_at)
     VALUES (@competitorId, @stageId, @rawTimeSeconds, @waitTimeSeconds, @status, @updatedAt)
     ON CONFLICT(competitor_id, stage_id) DO UPDATE SET
       raw_time_seconds = excluded.raw_time_seconds,
       wait_time_seconds = excluded.wait_time_seconds,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  ),
  getStageRecord: sqlite.prepare(
    `SELECT * FROM match_stage_records WHERE competitor_id = ? AND stage_id = ?`,
  ),
  listStageRecordsForEvent: sqlite.prepare(
    `SELECT sr.* FROM match_stage_records sr
     JOIN match_competitors c ON c.id = sr.competitor_id
     WHERE c.event_id = ?`,
  ),
  listStageRecordsForStage: sqlite.prepare(
    `SELECT * FROM match_stage_records WHERE stage_id = ?`,
  ),

  // Penalty / bonus counts
  upsertStagePen: sqlite.prepare(
    `INSERT INTO match_stage_pen_counts (competitor_id, pen_type_id, count)
     VALUES (@competitorId, @penTypeId, @count)
     ON CONFLICT(competitor_id, pen_type_id) DO UPDATE SET count = excluded.count`,
  ),
  upsertStageBon: sqlite.prepare(
    `INSERT INTO match_stage_bon_counts (competitor_id, bon_type_id, count)
     VALUES (@competitorId, @bonTypeId, @count)
     ON CONFLICT(competitor_id, bon_type_id) DO UPDATE SET count = excluded.count`,
  ),
  upsertObstaclePen: sqlite.prepare(
    `INSERT INTO match_obstacle_pen_counts (competitor_id, pen_type_id, count)
     VALUES (@competitorId, @penTypeId, @count)
     ON CONFLICT(competitor_id, pen_type_id) DO UPDATE SET count = excluded.count`,
  ),
  upsertObstacleBon: sqlite.prepare(
    `INSERT INTO match_obstacle_bon_counts (competitor_id, bon_type_id, count)
     VALUES (@competitorId, @bonTypeId, @count)
     ON CONFLICT(competitor_id, bon_type_id) DO UPDATE SET count = excluded.count`,
  ),
  listStagePensForEvent: sqlite.prepare(
    `SELECT pc.* FROM match_stage_pen_counts pc
     JOIN match_competitors c ON c.id = pc.competitor_id
     WHERE c.event_id = ?`,
  ),
  listStageBonsForEvent: sqlite.prepare(
    `SELECT bc.* FROM match_stage_bon_counts bc
     JOIN match_competitors c ON c.id = bc.competitor_id
     WHERE c.event_id = ?`,
  ),
  listObstaclePensForEvent: sqlite.prepare(
    `SELECT pc.* FROM match_obstacle_pen_counts pc
     JOIN match_competitors c ON c.id = pc.competitor_id
     WHERE c.event_id = ?`,
  ),
  listObstacleBonsForEvent: sqlite.prepare(
    `SELECT bc.* FROM match_obstacle_bon_counts bc
     JOIN match_competitors c ON c.id = bc.competitor_id
     WHERE c.event_id = ?`,
  ),
  listStagePensForCompetitorStage: sqlite.prepare(
    `SELECT pc.*, pt.owner_id AS stage_id
     FROM match_stage_pen_counts pc
     JOIN match_pen_types pt ON pt.id = pc.pen_type_id
     WHERE pc.competitor_id = ? AND pt.owner_kind = 'stage' AND pt.owner_id = ?`,
  ),
  listStageBonsForCompetitorStage: sqlite.prepare(
    `SELECT bc.*, bt.owner_id AS stage_id
     FROM match_stage_bon_counts bc
     JOIN match_bon_types bt ON bt.id = bc.bon_type_id
     WHERE bc.competitor_id = ? AND bt.owner_kind = 'stage' AND bt.owner_id = ?`,
  ),
  listObstaclePensForCompetitorObstacle: sqlite.prepare(
    `SELECT pc.*, pt.owner_id AS obstacle_id
     FROM match_obstacle_pen_counts pc
     JOIN match_pen_types pt ON pt.id = pc.pen_type_id
     WHERE pc.competitor_id = ? AND pt.owner_kind = 'obstacle' AND pt.owner_id = ?`,
  ),
  listObstacleBonsForCompetitorObstacle: sqlite.prepare(
    `SELECT bc.*, bt.owner_id AS obstacle_id
     FROM match_obstacle_bon_counts bc
     JOIN match_bon_types bt ON bt.id = bc.bon_type_id
     WHERE bc.competitor_id = ? AND bt.owner_kind = 'obstacle' AND bt.owner_id = ?`,
  ),
  getObstacleById: sqlite.prepare(`SELECT * FROM match_obstacles WHERE id = ?`),
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export const matchStorage = {
  // -------- Events --------
  createEvent(input: { name: string; eventDate: string; runMaxPoints?: number }): EventRow {
    const now = new Date().toISOString();
    const info = stmt.insertEvent.run({
      name: input.name,
      eventDate: input.eventDate,
      runMaxPoints: input.runMaxPoints ?? 400,
      isActive: 0,
      createdAt: now,
    });
    return stmt.getEvent.get(info.lastInsertRowid as number) as EventRow;
  },
  listEvents(): EventRow[] {
    return stmt.listEvents.all() as EventRow[];
  },
  getEvent(id: number): EventRow | null {
    return (stmt.getEvent.get(id) as EventRow | undefined) ?? null;
  },
  getActiveEvent(): EventRow | null {
    const all = this.listEvents();
    return all.find((e) => e.is_active === 1) ?? null;
  },
  setActiveEvent(id: number): void {
    stmt.setActiveEvent.run(id);
  },
  updateEvent(input: { id: number; name: string; eventDate: string; runMaxPoints: number }): void {
    stmt.updateEvent.run(input);
  },
  deleteEvent(id: number): void {
    // Cascade-ish: divisions, stages, obstacles, competitors and their records.
    sqlite.transaction(() => {
      const stages = stmt.listStages.all(id) as StageRow[];
      const obstacles = stmt.listObstacles.all(id) as ObstacleRow[];
      for (const s of stages) {
        stmt.deletePenTypesForOwner.run('stage', s.id);
        stmt.deleteBonTypesForOwner.run('stage', s.id);
      }
      for (const o of obstacles) {
        stmt.deletePenTypesForOwner.run('obstacle', o.id);
        stmt.deleteBonTypesForOwner.run('obstacle', o.id);
      }
      stmt.deleteStagesByEvent.run(id);
      stmt.deleteObstaclesByEvent.run(id);
      stmt.deleteDivisionsByEvent.run(id);
      stmt.deleteCompetitorsByEvent.run(id);
      stmt.deleteEvent.run(id);
    })();
  },

  // -------- Divisions --------
  createDivision(input: { eventId: number; code: string; name: string; sortOrder?: number }): DivisionRow {
    const info = stmt.insertDivision.run({
      eventId: input.eventId,
      code: input.code,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
    });
    return { id: info.lastInsertRowid as number, ...input, sort_order: input.sortOrder ?? 0 } as unknown as DivisionRow;
  },
  listDivisions(eventId: number): DivisionRow[] {
    return stmt.listDivisions.all(eventId) as DivisionRow[];
  },
  deleteDivision(id: number): void {
    stmt.deleteDivision.run(id);
  },

  // -------- Stages --------
  createStage(input: { eventId: number; name: string; sequence: number; maxPoints?: number }): StageRow {
    const info = stmt.insertStage.run({
      eventId: input.eventId,
      name: input.name,
      sequence: input.sequence,
      maxPoints: input.maxPoints ?? 100,
    });
    return stmt.listStages
      .all(input.eventId)
      .find((s) => (s as StageRow).id === info.lastInsertRowid) as StageRow;
  },
  listStages(eventId: number): StageRow[] {
    return stmt.listStages.all(eventId) as StageRow[];
  },
  deleteStage(id: number): void {
    sqlite.transaction(() => {
      stmt.deletePenTypesForOwner.run('stage', id);
      stmt.deleteBonTypesForOwner.run('stage', id);
      stmt.deleteStage.run(id);
    })();
  },

  // -------- Obstacles --------
  createObstacle(input: { eventId: number; name: string; sequence: number }): ObstacleRow {
    const info = stmt.insertObstacle.run(input);
    return stmt.listObstacles
      .all(input.eventId)
      .find((o) => (o as ObstacleRow).id === info.lastInsertRowid) as ObstacleRow;
  },
  listObstacles(eventId: number): ObstacleRow[] {
    return stmt.listObstacles.all(eventId) as ObstacleRow[];
  },
  deleteObstacle(id: number): void {
    sqlite.transaction(() => {
      stmt.deletePenTypesForOwner.run('obstacle', id);
      stmt.deleteBonTypesForOwner.run('obstacle', id);
      stmt.deleteObstacle.run(id);
    })();
  },

  // -------- Penalty / bonus types --------
  createPenType(input: {
    ownerKind: 'stage' | 'obstacle';
    ownerId: number;
    name: string;
    seconds: number;
    sortOrder?: number;
  }): PenBonTypeRow {
    const info = stmt.insertPenType.run({
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      name: input.name,
      seconds: input.seconds,
      sortOrder: input.sortOrder ?? 0,
    });
    return {
      id: info.lastInsertRowid as number,
      owner_kind: input.ownerKind,
      owner_id: input.ownerId,
      name: input.name,
      seconds: input.seconds,
      sort_order: input.sortOrder ?? 0,
    };
  },
  createBonType(input: {
    ownerKind: 'stage' | 'obstacle';
    ownerId: number;
    name: string;
    seconds: number;
    sortOrder?: number;
  }): PenBonTypeRow {
    const info = stmt.insertBonType.run({
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      name: input.name,
      seconds: input.seconds,
      sortOrder: input.sortOrder ?? 0,
    });
    return {
      id: info.lastInsertRowid as number,
      owner_kind: input.ownerKind,
      owner_id: input.ownerId,
      name: input.name,
      seconds: input.seconds,
      sort_order: input.sortOrder ?? 0,
    };
  },
  listPenTypes(ownerKind: 'stage' | 'obstacle', ownerId: number): PenBonTypeRow[] {
    return stmt.listPenTypesForOwner.all(ownerKind, ownerId) as PenBonTypeRow[];
  },
  listBonTypes(ownerKind: 'stage' | 'obstacle', ownerId: number): PenBonTypeRow[] {
    return stmt.listBonTypesForOwner.all(ownerKind, ownerId) as PenBonTypeRow[];
  },

  // -------- Competitors --------
  createCompetitor(input: {
    eventId: number;
    bib: string;
    firstName: string;
    lastName: string;
    divisionId: number;
    status?: 'registered' | 'checked_in' | 'no_show' | 'dq';
    notes?: string | null;
  }): CompetitorRow {
    const info = stmt.insertCompetitor.run({
      eventId: input.eventId,
      bib: input.bib,
      firstName: input.firstName,
      lastName: input.lastName,
      divisionId: input.divisionId,
      status: input.status ?? 'registered',
      notes: input.notes ?? null,
    });
    return stmt.getCompetitor.get(info.lastInsertRowid as number) as CompetitorRow;
  },
  updateCompetitor(input: {
    id: number;
    bib: string;
    firstName: string;
    lastName: string;
    divisionId: number;
    status: 'registered' | 'checked_in' | 'no_show' | 'dq';
    notes: string | null;
  }): void {
    stmt.updateCompetitor.run(input);
  },
  setCompetitorStatus(id: number, status: 'registered' | 'checked_in' | 'no_show' | 'dq'): void {
    stmt.setCompetitorStatus.run(status, id);
  },
  listCompetitors(eventId: number): CompetitorRow[] {
    return stmt.listCompetitors.all(eventId) as CompetitorRow[];
  },
  getCompetitor(id: number): CompetitorRow | null {
    return (stmt.getCompetitor.get(id) as CompetitorRow | undefined) ?? null;
  },
  deleteCompetitor(id: number): void {
    stmt.deleteCompetitor.run(id);
  },
  /** Throws if a competitor in the same event already has this bib. */
  assertBibUnique(eventId: number, bib: string, excludeId = 0): void {
    const row = stmt.countCompetitorsWithBib.get(eventId, bib, excludeId) as { c: number };
    if (row.c > 0) {
      throw new Error(`Bib ${bib} already in use in this event.`);
    }
  },

  // -------- Squadding import --------
  /**
   * Import a parsed PractiScore squadding document. Each shooter slot becomes a
   * (competitor, squad) pair. If a division code is unknown, it's auto-created.
   * If `replace` is true, all existing competitors and squads for the event are
   * cleared first. Bibs are auto-assigned 3-digit, sequential, unique per event.
   */
  importSquadding(input: {
    eventId: number;
    bays: Array<{
      day: 'FRIDAY' | 'SATURDAY' | 'SUNDAY' | 'STAFF';
      bay: number;
      timeStart: string | null;
      timeEnd: string | null;
      slots: Array<{
        slotNumber: number;
        firstName: string;
        lastName: string;
        divisionName: string; // e.g. "Nv 2-Gun", "2-Gun", "Pcc"
      }>;
    }>;
    replace?: boolean;
  }): { competitors: number; squads: number; divisions: number } {
    const ev = this.getEvent(input.eventId);
    if (!ev) throw new Error('event not found');

    return sqlite.transaction(() => {
      if (input.replace) {
        stmt.deleteSquadsByEvent.run(input.eventId);
        stmt.deleteCompetitorsByEvent.run(input.eventId);
      }

      // Resolve / create divisions on the fly. Code = ALLCAPS slug.
      const existing = this.listDivisions(input.eventId);
      const divByName = new Map<string, number>();
      for (const d of existing) divByName.set(d.name.trim().toLowerCase(), d.id);
      let divCreated = 0;
      const divCodeOf = (name: string) =>
        name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 16);

      // Next bib (3-digit, zero-padded, continues from current max).
      const maxRow = stmt.maxCompetitorBib.get(input.eventId) as { m: number | null };
      let nextBib = (maxRow.m ?? 0) + 1;
      const fmtBib = (n: number) => String(n).padStart(3, '0');

      let competitors = 0;
      let squads = 0;

      for (const bay of input.bays) {
        for (const slot of bay.slots) {
          const divName = slot.divisionName.trim();
          if (!divName) continue;
          const key = divName.toLowerCase();
          let divisionId = divByName.get(key);
          if (!divisionId) {
            const code = divCodeOf(divName);
            const created = this.createDivision({
              eventId: input.eventId,
              code,
              name: divName,
              sortOrder: divByName.size,
            });
            divisionId = created.id;
            divByName.set(key, divisionId);
            divCreated++;
          }

          const bib = fmtBib(nextBib++);
          const comp = this.createCompetitor({
            eventId: input.eventId,
            bib,
            firstName: slot.firstName,
            lastName: slot.lastName,
            divisionId,
          });
          competitors++;

          stmt.insertSquad.run({
            eventId: input.eventId,
            competitorId: comp.id,
            day: bay.day,
            bay: bay.bay,
            timeStart: bay.timeStart,
            timeEnd: bay.timeEnd,
            slotNumber: slot.slotNumber,
          });
          squads++;
        }
      }

      return { competitors, squads, divisions: divCreated };
    })();
  },
  listSquads(eventId: number) {
    return stmt.listSquads.all(eventId) as Array<{
      id: number;
      event_id: number;
      competitor_id: number;
      day: string;
      bay: number;
      time_start: string | null;
      time_end: string | null;
      slot_number: number;
    }>;
  },

  // -------- Run records --------
  upsertRunRecord(input: {
    competitorId: number;
    startMs: number | null;
    finishMs: number | null;
    status: 'ok' | 'no_show' | 'dq';
  }): void {
    stmt.upsertRunRecord.run(input);
  },
  getRunRecord(competitorId: number): RunRecRow | null {
    return (stmt.getRunRecord.get(competitorId) as RunRecRow | undefined) ?? null;
  },
  listRunRecords(eventId: number): RunRecRow[] {
    return stmt.listRunRecords.all(eventId) as RunRecRow[];
  },

  // -------- Stage records (the core RO write path) --------
  /**
   * Save a complete stage scoring entry: raw time, wait time, status, and ALL
   * penalty/bonus counts for that (competitor, stage) in one transaction.
   *
   * `penaltyCounts` and `bonusCounts` are maps of penTypeId -> count and
   * bonTypeId -> count for the types that belong to this stage.
   */
  saveStageEntry(input: {
    competitorId: number;
    stageId: number;
    rawTimeSeconds: number | null;
    waitTimeSeconds: number;
    status: 'ok' | 'no_show' | 'dq';
    penaltyCounts: Record<number, number>;
    bonusCounts: Record<number, number>;
  }): void {
    const now = new Date().toISOString();
    sqlite.transaction(() => {
      stmt.upsertStageRecord.run({
        competitorId: input.competitorId,
        stageId: input.stageId,
        rawTimeSeconds: input.rawTimeSeconds,
        waitTimeSeconds: input.waitTimeSeconds,
        status: input.status,
        updatedAt: now,
      });
      for (const [penTypeIdStr, count] of Object.entries(input.penaltyCounts)) {
        stmt.upsertStagePen.run({
          competitorId: input.competitorId,
          penTypeId: Number(penTypeIdStr),
          count,
        });
      }
      for (const [bonTypeIdStr, count] of Object.entries(input.bonusCounts)) {
        stmt.upsertStageBon.run({
          competitorId: input.competitorId,
          bonTypeId: Number(bonTypeIdStr),
          count,
        });
      }
    })();
  },
  getStageEntry(competitorId: number, stageId: number): {
    record: StageRecRow | null;
    penaltyCounts: Record<number, number>;
    bonusCounts: Record<number, number>;
  } {
    const record = (stmt.getStageRecord.get(competitorId, stageId) as StageRecRow | undefined) ?? null;
    const pens = stmt.listStagePensForCompetitorStage.all(competitorId, stageId) as Array<{
      pen_type_id: number;
      count: number;
    }>;
    const bons = stmt.listStageBonsForCompetitorStage.all(competitorId, stageId) as Array<{
      bon_type_id: number;
      count: number;
    }>;
    const penaltyCounts: Record<number, number> = {};
    const bonusCounts: Record<number, number> = {};
    for (const p of pens) penaltyCounts[p.pen_type_id] = p.count;
    for (const b of bons) bonusCounts[b.bon_type_id] = b.count;
    return { record, penaltyCounts, bonusCounts };
  },

  // -------- Obstacle records --------
  getObstacle(id: number): ObstacleRow | null {
    return (stmt.getObstacleById.get(id) as ObstacleRow | undefined) ?? null;
  },
  getObstacleEntry(competitorId: number, obstacleId: number): {
    penaltyCounts: Record<number, number>;
    bonusCounts: Record<number, number>;
  } {
    const pens = stmt.listObstaclePensForCompetitorObstacle.all(competitorId, obstacleId) as Array<{
      pen_type_id: number; count: number;
    }>;
    const bons = stmt.listObstacleBonsForCompetitorObstacle.all(competitorId, obstacleId) as Array<{
      bon_type_id: number; count: number;
    }>;
    const penaltyCounts: Record<number, number> = {};
    const bonusCounts: Record<number, number> = {};
    for (const p of pens) penaltyCounts[p.pen_type_id] = p.count;
    for (const b of bons) bonusCounts[b.bon_type_id] = b.count;
    return { penaltyCounts, bonusCounts };
  },
  saveObstacleEntry(input: {
    competitorId: number;
    obstacleId: number;
    penaltyCounts: Record<number, number>;
    bonusCounts: Record<number, number>;
  }): void {
    sqlite.transaction(() => {
      for (const [penTypeIdStr, count] of Object.entries(input.penaltyCounts)) {
        stmt.upsertObstaclePen.run({
          competitorId: input.competitorId,
          penTypeId: Number(penTypeIdStr),
          count,
        });
      }
      for (const [bonTypeIdStr, count] of Object.entries(input.bonusCounts)) {
        stmt.upsertObstacleBon.run({
          competitorId: input.competitorId,
          bonTypeId: Number(bonTypeIdStr),
          count,
        });
      }
    })();
  },

  // -------- Build ScoringInput for the engine --------
  /**
   * Assemble a ScoringInput by reading every relevant row for an event.
   * One pass per table. Returns a structure the engine can compute on directly.
   */
  buildScoringInput(eventId: number): ScoringInput {
    const event = this.getEvent(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    const divisions = this.listDivisions(eventId).map((d) => ({
      id: String(d.id),
      code: d.code,
      name: d.name,
    }));
    const stagesRaw = this.listStages(eventId);
    const obstaclesRaw = this.listObstacles(eventId);

    const stages: Stage[] = stagesRaw.map((s) => ({
      id: String(s.id),
      name: s.name,
      sequence: s.sequence,
      maxPoints: s.max_points,
      penaltyTypes: this.listPenTypes('stage', s.id).map(toPenBon),
      bonusTypes: this.listBonTypes('stage', s.id).map(toPenBon),
    }));
    const obstacles: Obstacle[] = obstaclesRaw.map((o) => ({
      id: String(o.id),
      name: o.name,
      sequence: o.sequence,
      penaltyTypes: this.listPenTypes('obstacle', o.id).map(toPenBon),
      bonusTypes: this.listBonTypes('obstacle', o.id).map(toPenBon),
    }));

    const competitors = this.listCompetitors(eventId).map((c) => ({
      id: String(c.id),
      bib: c.bib,
      firstName: c.first_name,
      lastName: c.last_name,
      divisionId: String(c.division_id),
      status: (c.status === 'no_show' || c.status === 'dq' ? c.status : 'ok') as
        | 'ok'
        | 'no_show'
        | 'dq',
    }));

    const runRecords = (stmt.listRunRecords.all(eventId) as RunRecRow[]).map((r) => ({
      competitorId: String(r.competitor_id),
      startMs: r.start_ms,
      finishMs: r.finish_ms,
      status: r.status,
    }));

    // Stage records + their pen/bon counts (joined into in-memory maps).
    const stageRecRows = stmt.listStageRecordsForEvent.all(eventId) as StageRecRow[];
    const stagePens = stmt.listStagePensForEvent.all(eventId) as Array<{
      competitor_id: number;
      pen_type_id: number;
      count: number;
    }>;
    const stageBons = stmt.listStageBonsForEvent.all(eventId) as Array<{
      competitor_id: number;
      bon_type_id: number;
      count: number;
    }>;

    // Index pen/bon counts by competitorId for fast lookup.
    const penByComp: Record<string, Record<string, number>> = {};
    for (const p of stagePens) {
      const k = String(p.competitor_id);
      penByComp[k] ??= {};
      penByComp[k][String(p.pen_type_id)] = p.count;
    }
    const bonByComp: Record<string, Record<string, number>> = {};
    for (const b of stageBons) {
      const k = String(b.competitor_id);
      bonByComp[k] ??= {};
      bonByComp[k][String(b.bon_type_id)] = b.count;
    }

    const stageRecords = stageRecRows.map((r) => ({
      competitorId: String(r.competitor_id),
      stageId: String(r.stage_id),
      rawTimeSeconds: r.raw_time_seconds,
      waitTimeSeconds: r.wait_time_seconds,
      penaltyCounts: penByComp[String(r.competitor_id)] ?? {},
      bonusCounts: bonByComp[String(r.competitor_id)] ?? {},
      status: r.status,
    }));

    // Obstacle records: one synthetic record per (competitor, obstacle) where
    // any pen/bon count exists. Engine only needs the counts.
    const obsPens = stmt.listObstaclePensForEvent.all(eventId) as Array<{
      competitor_id: number;
      pen_type_id: number;
      count: number;
    }>;
    const obsBons = stmt.listObstacleBonsForEvent.all(eventId) as Array<{
      competitor_id: number;
      bon_type_id: number;
      count: number;
    }>;

    // Need to map pen_type_id -> obstacle_id (owner_id), so look up types.
    const penTypeById = new Map<number, number>();
    const bonTypeById = new Map<number, number>();
    for (const o of obstaclesRaw) {
      for (const t of this.listPenTypes('obstacle', o.id)) penTypeById.set(t.id, o.id);
      for (const t of this.listBonTypes('obstacle', o.id)) bonTypeById.set(t.id, o.id);
    }

    // Build (competitor, obstacle) -> { pens, bons }.
    type ObsKey = string;
    const obsRecMap = new Map<ObsKey, { competitorId: string; obstacleId: string; penaltyCounts: Record<string, number>; bonusCounts: Record<string, number> }>();
    const keyOf = (cid: number, oid: number) => `${cid}:${oid}`;
    for (const p of obsPens) {
      const obsId = penTypeById.get(p.pen_type_id);
      if (obsId == null) continue;
      const k = keyOf(p.competitor_id, obsId);
      const existing = obsRecMap.get(k) ?? {
        competitorId: String(p.competitor_id),
        obstacleId: String(obsId),
        penaltyCounts: {},
        bonusCounts: {},
      };
      existing.penaltyCounts[String(p.pen_type_id)] = p.count;
      obsRecMap.set(k, existing);
    }
    for (const b of obsBons) {
      const obsId = bonTypeById.get(b.bon_type_id);
      if (obsId == null) continue;
      const k = keyOf(b.competitor_id, obsId);
      const existing = obsRecMap.get(k) ?? {
        competitorId: String(b.competitor_id),
        obstacleId: String(obsId),
        penaltyCounts: {},
        bonusCounts: {},
      };
      existing.bonusCounts[String(b.bon_type_id)] = b.count;
      obsRecMap.set(k, existing);
    }
    const obstacleRecords = Array.from(obsRecMap.values());

    return {
      runMaxPoints: event.run_max_points,
      divisions,
      stages,
      obstacles,
      competitors,
      runRecords,
      stageRecords,
      obstacleRecords,
    };
  },
};

function toPenBon(r: PenBonTypeRow): PenaltyOrBonusType {
  return { id: String(r.id), name: r.name, seconds: r.seconds };
}

export type { EventRow, DivisionRow, StageRow, ObstacleRow, PenBonTypeRow, CompetitorRow, RunRecRow, StageRecRow };
