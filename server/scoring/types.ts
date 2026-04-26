/**
 * RNG Ops scoring types
 *
 * Pure data structures for the scoring engine. No DB, no UI coupling.
 * Anything that can compute results can produce these inputs and consume
 * these outputs (DB, CSV import, future spectator API, tests).
 */

export type ComponentStatus = 'ok' | 'no_show' | 'dq';

/** A division (e.g. "2G", "PCC"). Scoring is computed independently per division. */
export interface Division {
  id: string;
  code: string;        // "2G"
  name: string;        // "Two-Gun Open"
}

/** A competitor entry. One human running multiple divisions = multiple Competitor rows. */
export interface Competitor {
  id: string;
  bib: string;         // "042"
  firstName: string;
  lastName: string;
  divisionId: string;
  /** Match-level DQ. If 'dq' or 'no_show', every component scores 0 regardless of records. */
  status: ComponentStatus;
}

/** A penalty or bonus type configured for a stage or obstacle. Seconds are positive. */
export interface PenaltyOrBonusType {
  id: string;
  name: string;
  seconds: number;     // always positive; sign is determined by penalty vs bonus
}

export interface Stage {
  id: string;
  name: string;
  sequence: number;
  maxPoints: number;   // default 100
  penaltyTypes: PenaltyOrBonusType[];
  bonusTypes: PenaltyOrBonusType[];
}

export interface Obstacle {
  id: string;
  name: string;
  sequence: number;
  penaltyTypes: PenaltyOrBonusType[];
  bonusTypes: PenaltyOrBonusType[];
}

/** A single (competitor, stage) record. */
export interface StageRecord {
  competitorId: string;
  stageId: string;
  rawTimeSeconds: number | null;     // null if no_show / dq for this stage
  /**
   * Wait time the competitor spent at this stage, in decimal seconds.
   * Tablet UI captures this as MM:SS via time-format.parseMmSs() and stores seconds.
   * Subtracted from elapsed time during run-time computation.
   */
  waitTimeSeconds: number;
  /** Map of stage penalty type id → count. */
  penaltyCounts: Record<string, number>;
  /** Map of stage bonus type id → count. */
  bonusCounts: Record<string, number>;
  status: ComponentStatus;
}

/** A single (competitor, obstacle) record. Used to compute run-time adjustments. */
export interface ObstacleRecord {
  competitorId: string;
  obstacleId: string;
  penaltyCounts: Record<string, number>;
  bonusCounts: Record<string, number>;
}

/** Run start/finish for a single competitor. Timestamps in epoch milliseconds. */
export interface RunRecord {
  competitorId: string;
  startMs: number | null;
  finishMs: number | null;
  status: ComponentStatus;
}

/** Full event-day input. Consumed by computeResults(). */
export interface ScoringInput {
  runMaxPoints: number;              // default 400
  divisions: Division[];
  stages: Stage[];
  obstacles: Obstacle[];
  competitors: Competitor[];
  runRecords: RunRecord[];
  stageRecords: StageRecord[];
  obstacleRecords: ObstacleRecord[];
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

export interface RunResultRow {
  place: number | null;              // null for DNS/DQ
  competitorId: string;
  bib: string;
  name: string;                      // "Last, First"
  divisionCode: string;
  rawTimeSeconds: number | null;     // elapsed - waitTotal (the time on course before obstacle adjustments)
  penaltySeconds: number;            // obstacle penalty total
  bonusSeconds: number;              // obstacle bonus total
  timeSeconds: number | null;        // raw + pen - bon, floored at 0
  points: number;                    // 0 to runMaxPoints
  percent: number;                   // 0..100
  status: ComponentStatus;
}

export interface StageResultRow {
  place: number | null;
  competitorId: string;
  bib: string;
  name: string;
  divisionCode: string;
  rawTimeSeconds: number | null;
  penaltySeconds: number;
  bonusSeconds: number;
  timeSeconds: number | null;        // raw + pen - bon
  points: number;
  percent: number;
  status: ComponentStatus;
}

export interface MatchTotalRow {
  place: number | null;
  competitorId: string;
  bib: string;
  name: string;
  divisionCode: string;
  runPoints: number;
  stagePoints: Record<string, number>; // stageId -> points
  totalPoints: number;
}

export interface ScoringOutput {
  /** Run results grouped by division code. */
  runByDivision: Record<string, RunResultRow[]>;
  /** Stage results grouped by stageId then division code. */
  stageByDivision: Record<string, Record<string, StageResultRow[]>>;
  /** Match totals grouped by division code. */
  matchByDivision: Record<string, MatchTotalRow[]>;
}
