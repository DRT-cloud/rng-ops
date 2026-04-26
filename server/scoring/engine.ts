/**
 * RNG Ops scoring engine
 *
 * Pure function: ScoringInput -> ScoringOutput.
 * No I/O, no DB, no async. Identical inputs always produce identical outputs.
 *
 * Formulas (locked, verified against sample CSVs):
 *
 *   Stage time   = raw + Σ(penalty seconds × count) − Σ(bonus seconds × count), floored at 0
 *   Run time     = (finish − start) − Σ(stage wait times) + Σ(obstacle pen) − Σ(obstacle bon), floored at 0
 *   Points       = (fastest_in_division / your_time) × max_points
 *
 * Per-division independent scoring: 2G fastest gets 100% of max, PCC fastest gets 100% of max, etc.
 *
 * Match-level DQ or no_show: every component scores 0.
 * Component-level DQ or no_show: that component scores 0; others still scored normally.
 */

import type {
  ComponentStatus,
  Competitor,
  Division,
  MatchTotalRow,
  Obstacle,
  ObstacleRecord,
  PenaltyOrBonusType,
  RunRecord,
  RunResultRow,
  ScoringInput,
  ScoringOutput,
  Stage,
  StageRecord,
  StageResultRow,
} from './types';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Round to N decimal places. Uses toFixed semantics (banker's rounding NOT used; standard half-up). */
export function round(n: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/** Sum of (count × seconds) over a list of types and a counts map. Counts default to 0. */
function sumWeighted(
  types: PenaltyOrBonusType[],
  counts: Record<string, number> | undefined,
): number {
  if (!counts) return 0;
  let total = 0;
  for (const t of types) {
    const c = counts[t.id] ?? 0;
    if (c > 0) total += c * t.seconds;
  }
  return total;
}

/** True if the component should be scored (raw time exists and status is ok and match-level is ok). */
function isScorable(componentStatus: ComponentStatus, matchStatus: ComponentStatus): boolean {
  return componentStatus === 'ok' && matchStatus === 'ok';
}

/** Format competitor display name as "Last, First". */
function nameOf(c: Competitor): string {
  return `${c.lastName}, ${c.firstName}`;
}

// -----------------------------------------------------------------------------
// Per-component time computations
// -----------------------------------------------------------------------------

interface StageComputed {
  rawTime: number | null;
  pen: number;
  bon: number;
  time: number | null;
  status: ComponentStatus;
  waitTime: number; // applied to run, regardless of stage status
}

export function computeStageTime(
  rec: StageRecord | undefined,
  stage: Stage,
  matchStatus: ComponentStatus,
): StageComputed {
  // Match-level DQ or no_show short-circuits everything.
  if (matchStatus !== 'ok') {
    return {
      rawTime: null,
      pen: 0,
      bon: 0,
      time: null,
      status: matchStatus,
      waitTime: 0,
    };
  }
  if (!rec) {
    // No record = treat as no_show for this stage; no wait time accrued.
    return { rawTime: null, pen: 0, bon: 0, time: null, status: 'no_show', waitTime: 0 };
  }
  const status = rec.status;
  const waitTime = rec.waitTimeSeconds ?? 0; // wait time still recorded even for DQ

  if (status !== 'ok' || rec.rawTimeSeconds == null) {
    return { rawTime: null, pen: 0, bon: 0, time: null, status, waitTime };
  }
  const pen = sumWeighted(stage.penaltyTypes, rec.penaltyCounts);
  const bon = sumWeighted(stage.bonusTypes, rec.bonusCounts);
  const raw = rec.rawTimeSeconds;
  const time = Math.max(0, raw + pen - bon);
  return { rawTime: raw, pen, bon, time, status, waitTime };
}

interface RunComputed {
  /** Elapsed minus wait time = time on course before obstacle adjustments. Matches CSV "Raw Time". */
  rawTime: number | null;
  /** Σ obstacle penalty seconds. */
  pen: number;
  /** Σ obstacle bonus seconds. */
  bon: number;
  /** rawTime + pen − bon, floored at 0. */
  time: number | null;
  status: ComponentStatus;
}

export function computeRunTime(
  competitor: Competitor,
  runRec: RunRecord | undefined,
  stageRecs: StageRecord[],
  obstacles: Obstacle[],
  obstacleRecs: ObstacleRecord[],
): RunComputed {
  if (competitor.status !== 'ok') {
    return { rawTime: null, pen: 0, bon: 0, time: null, status: competitor.status };
  }
  if (!runRec || runRec.status !== 'ok' || runRec.startMs == null || runRec.finishMs == null) {
    const status = runRec?.status ?? 'no_show';
    return { rawTime: null, pen: 0, bon: 0, time: null, status };
  }
  const elapsed = (runRec.finishMs - runRec.startMs) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return { rawTime: null, pen: 0, bon: 0, time: null, status: 'dq' };
  }
  const waitTotal = stageRecs.reduce((acc, r) => acc + (r.waitTimeSeconds ?? 0), 0);
  const rawTime = Math.max(0, elapsed - waitTotal);

  let pen = 0;
  let bon = 0;
  for (const obs of obstacles) {
    const rec = obstacleRecs.find((r) => r.obstacleId === obs.id);
    if (!rec) continue;
    pen += sumWeighted(obs.penaltyTypes, rec.penaltyCounts);
    bon += sumWeighted(obs.bonusTypes, rec.bonusCounts);
  }
  const time = Math.max(0, rawTime + pen - bon);
  return { rawTime, pen, bon, time, status: 'ok' };
}

// -----------------------------------------------------------------------------
// Ranking and points
// -----------------------------------------------------------------------------

interface RankableRow {
  competitorId: string;
  time: number | null;
  status: ComponentStatus;
}

interface RankResult {
  place: number | null;
  points: number;
  percent: number;
}

/**
 * Rank a set of rows within a single division and assign points.
 * Returns a map: competitorId → { place, points, percent }.
 *
 * Rules:
 * - Only rows with status === 'ok' AND time != null AND time > 0 are ranked and earn points.
 * - Fastest time gets max_points (100% of max).
 * - Others get (fastest / your_time) × max_points.
 * - DNS/DQ: place = null, points = 0, percent = 0.
 * - Tie handling: equal times get the same place number (competition ranking, "1224"); next place skips.
 */
export function rankAndScore(
  rows: RankableRow[],
  maxPoints: number,
): Map<string, RankResult> {
  const out = new Map<string, RankResult>();

  const scorable = rows.filter(
    (r) => r.status === 'ok' && r.time != null && (r.time as number) > 0,
  ) as Array<RankableRow & { time: number }>;

  if (scorable.length === 0) {
    // Nobody scored — everyone gets 0.
    for (const r of rows) {
      out.set(r.competitorId, { place: null, points: 0, percent: 0 });
    }
    return out;
  }

  // Sequential ranking (Option A): ties get adjacent place numbers (1, 2, 3, 4)
  // not competition ranking (1, 2, 2, 4). Tied times still earn identical
  // points and percent — only the displayed place number differs.
  // Tie-break: stable sort by time only; ties resolved by input order.
  scorable.sort((a, b) => a.time - b.time);
  const fastest = scorable[0].time;

  scorable.forEach((row, idx) => {
    const points = (fastest / row.time) * maxPoints;
    const percent = (fastest / row.time) * 100;
    out.set(row.competitorId, { place: idx + 1, points, percent });
  });

  // DNS/DQ rows: no place, no points.
  for (const r of rows) {
    if (!out.has(r.competitorId)) {
      out.set(r.competitorId, { place: null, points: 0, percent: 0 });
    }
  }

  return out;
}

// -----------------------------------------------------------------------------
// Top-level: computeResults
// -----------------------------------------------------------------------------

export function computeResults(input: ScoringInput): ScoringOutput {
  const divisionByCompetitor = new Map<string, Division>();
  const divisionById = new Map<string, Division>();
  for (const d of input.divisions) divisionById.set(d.id, d);
  for (const c of input.competitors) {
    const d = divisionById.get(c.divisionId);
    if (d) divisionByCompetitor.set(c.id, d);
  }

  const stageRecsByCompetitor = groupBy(input.stageRecords, (r) => r.competitorId);
  const obstacleRecsByCompetitor = groupBy(input.obstacleRecords, (r) => r.competitorId);
  const runRecByCompetitor = new Map<string, RunRecord>();
  for (const r of input.runRecords) runRecByCompetitor.set(r.competitorId, r);

  // Step 1: compute every competitor's run time and every (competitor, stage) time.
  const runComputed = new Map<string, RunComputed>();
  const stageComputed = new Map<string, Map<string, StageComputed>>(); // stageId -> competitorId -> StageComputed

  for (const stage of input.stages) {
    stageComputed.set(stage.id, new Map());
  }

  for (const c of input.competitors) {
    const stageRecs = stageRecsByCompetitor.get(c.id) ?? [];
    const obstacleRecs = obstacleRecsByCompetitor.get(c.id) ?? [];
    const runRec = runRecByCompetitor.get(c.id);

    runComputed.set(
      c.id,
      computeRunTime(c, runRec, stageRecs, input.obstacles, obstacleRecs),
    );

    for (const stage of input.stages) {
      const rec = stageRecs.find((r) => r.stageId === stage.id);
      stageComputed
        .get(stage.id)!
        .set(c.id, computeStageTime(rec, stage, c.status));
    }
  }

  // Step 2: rank within each division, for run and each stage.
  const competitorsByDivision = groupBy(input.competitors, (c) => c.divisionId);

  const runByDivision: Record<string, RunResultRow[]> = {};
  for (const [divId, comps] of competitorsByDivision.entries()) {
    const div = divisionById.get(divId);
    if (!div) continue;
    const rows: RankableRow[] = comps.map((c) => {
      const rc = runComputed.get(c.id)!;
      return { competitorId: c.id, time: rc.time, status: rc.status };
    });
    const ranks = rankAndScore(rows, input.runMaxPoints);

    const resultRows: RunResultRow[] = comps.map((c) => {
      const rc = runComputed.get(c.id)!;
      const rk = ranks.get(c.id)!;
      return {
        place: rk.place,
        competitorId: c.id,
        bib: c.bib,
        name: nameOf(c),
        divisionCode: div.code,
        rawTimeSeconds: rc.rawTime,
        penaltySeconds: rc.pen,
        bonusSeconds: rc.bon,
        timeSeconds: rc.time,
        points: rk.points,
        percent: rk.percent,
        status: rc.status,
      };
    });
    // Sort: scored rows by place ascending, then DNS/DQ rows by name.
    resultRows.sort(compareResultRows);
    runByDivision[div.code] = resultRows;
  }

  // Per-stage rankings
  const stageByDivision: Record<string, Record<string, StageResultRow[]>> = {};
  for (const stage of input.stages) {
    stageByDivision[stage.id] = {};
    for (const [divId, comps] of competitorsByDivision.entries()) {
      const div = divisionById.get(divId);
      if (!div) continue;
      const stageMap = stageComputed.get(stage.id)!;

      const rows: RankableRow[] = comps.map((c) => {
        const sc = stageMap.get(c.id)!;
        return { competitorId: c.id, time: sc.time, status: sc.status };
      });
      const ranks = rankAndScore(rows, stage.maxPoints);

      const resultRows: StageResultRow[] = comps.map((c) => {
        const sc = stageMap.get(c.id)!;
        const rk = ranks.get(c.id)!;
        return {
          place: rk.place,
          competitorId: c.id,
          bib: c.bib,
          name: nameOf(c),
          divisionCode: div.code,
          rawTimeSeconds: sc.rawTime,
          penaltySeconds: sc.pen,
          bonusSeconds: sc.bon,
          timeSeconds: sc.time,
          points: rk.points,
          percent: rk.percent,
          status: sc.status,
        };
      });
      resultRows.sort(compareStageRows);
      stageByDivision[stage.id][div.code] = resultRows;
    }
  }

  // Step 3: match totals = run points + sum(stage points) per competitor, ranked per division.
  const matchByDivision: Record<string, MatchTotalRow[]> = {};
  for (const [divId, comps] of competitorsByDivision.entries()) {
    const div = divisionById.get(divId);
    if (!div) continue;

    const rows: MatchTotalRow[] = comps.map((c) => {
      const runRow = (runByDivision[div.code] ?? []).find((r) => r.competitorId === c.id);
      const runPoints = runRow?.points ?? 0;
      const stagePoints: Record<string, number> = {};
      let stageSum = 0;
      for (const stage of input.stages) {
        const stageRows = stageByDivision[stage.id][div.code] ?? [];
        const sRow = stageRows.find((r) => r.competitorId === c.id);
        const pts = sRow?.points ?? 0;
        stagePoints[stage.id] = pts;
        stageSum += pts;
      }
      return {
        place: null,
        competitorId: c.id,
        bib: c.bib,
        name: nameOf(c),
        divisionCode: div.code,
        runPoints,
        stagePoints,
        totalPoints: runPoints + stageSum,
      };
    });

    // Sequential ranking (Option A) for match totals.
    rows.sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
    rows.forEach((row, idx) => {
      row.place = row.totalPoints > 0 ? idx + 1 : null;
    });

    matchByDivision[div.code] = rows;
  }

  return { runByDivision, stageByDivision, matchByDivision };
}

// -----------------------------------------------------------------------------
// Sort comparators
// -----------------------------------------------------------------------------

function compareResultRows(a: RunResultRow, b: RunResultRow): number {
  if (a.place != null && b.place != null) return a.place - b.place;
  if (a.place != null) return -1;
  if (b.place != null) return 1;
  return a.name.localeCompare(b.name);
}

function compareStageRows(a: StageResultRow, b: StageResultRow): number {
  if (a.place != null && b.place != null) return a.place - b.place;
  if (a.place != null) return -1;
  if (b.place != null) return 1;
  return a.name.localeCompare(b.name);
}

// -----------------------------------------------------------------------------
// Misc
// -----------------------------------------------------------------------------

function groupBy<T, K>(arr: T[], keyFn: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
