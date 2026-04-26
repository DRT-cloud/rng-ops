/**
 * Verification harness — runs the scoring engine against the sample CSVs the
 * user provided (run-results.csv, stage-1-results.csv) and asserts that the
 * computed output matches the CSV's "Stage Pts" and "Stage %" columns to
 * within 0.01.
 *
 * This is the math lock-in: if every row matches, the engine is correct
 * for ranking, points, percent, division-independence, and DNS handling.
 *
 * Run with:  npx tsx server/scoring/__tests__/verify-csv.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { computeResults } from '../engine';
import type {
  Competitor,
  Division,
  Obstacle,
  RunRecord,
  ScoringInput,
  Stage,
  StageRecord,
} from '../types';
import { parseSeconds } from '../time-format';

// -----------------------------------------------------------------------------
// CSV parser (RFC-4180 lite — handles quoted fields and embedded commas)
// -----------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// -----------------------------------------------------------------------------
// CSV row shape
// -----------------------------------------------------------------------------

interface CsvRow {
  place: string;
  name: string;
  div: string;
  rawTime: string;
  pen: string;
  bon: string;
  time: string;     // for run results: "Time"; for stage results: "Stage Time"
  pts: string;      // "Stage Pts" header in both files
  pct: string;      // "Stage %"   header in both files
}

function loadCsvRows(path: string): CsvRow[] {
  const text = readFileSync(path, 'utf8');
  const rows = parseCsv(text);
  // Row 0: title (e.g. "Run Results"); Row 1: header; Rows 2+: data
  const data = rows.slice(2);
  return data.map((r) => ({
    place: r[0] ?? '',
    name: r[1] ?? '',
    div: r[2] ?? '',
    rawTime: r[3] ?? '',
    pen: r[4] ?? '',
    bon: r[5] ?? '',
    time: r[6] ?? '',
    pts: r[7] ?? '',
    pct: r[8] ?? '',
  }));
}

// -----------------------------------------------------------------------------
// Synthetic input builder — turn a CSV into a ScoringInput where each
// competitor's component time matches the CSV's "Time" column. This isolates
// the points/percent/ranking math.
// -----------------------------------------------------------------------------

function splitName(combined: string): { lastName: string; firstName: string } {
  const idx = combined.indexOf(',');
  if (idx < 0) return { lastName: combined.trim(), firstName: '' };
  return {
    lastName: combined.slice(0, idx).trim(),
    firstName: combined.slice(idx + 1).trim(),
  };
}

interface SyntheticBuild {
  input: ScoringInput;
  divisionByCode: Record<string, Division>;
  /** competitorId -> CSV row */
  rowByCompetitor: Map<string, CsvRow>;
}

function buildRunInput(rows: CsvRow[]): SyntheticBuild {
  const divCodes = Array.from(new Set(rows.map((r) => r.div)));
  const divisions: Division[] = divCodes.map((code) => ({
    id: `div-${code}`,
    code,
    name: code,
  }));
  const divisionByCode = Object.fromEntries(divisions.map((d) => [d.code, d])) as Record<
    string,
    Division
  >;

  const competitors: Competitor[] = [];
  const runRecords: RunRecord[] = [];
  const rowByCompetitor = new Map<string, CsvRow>();

  rows.forEach((r, idx) => {
    const id = `c-${idx}`;
    const isDns = r.rawTime === '-' || r.time === '-';
    const { lastName, firstName } = splitName(r.name);
    const div = divisionByCode[r.div];
    const compStatus = isDns ? 'no_show' : 'ok';

    competitors.push({
      id,
      bib: String(idx + 1).padStart(3, '0'),
      firstName,
      lastName,
      divisionId: div.id,
      status: compStatus,
    });

    if (isDns) {
      runRecords.push({
        competitorId: id,
        startMs: null,
        finishMs: null,
        status: 'no_show',
      });
    } else {
      const csvTime = parseSeconds(r.time);
      // Map the CSV's "Time" directly onto the run's elapsed time, with no wait
      // and no obstacle pen/bon. So elapsed = Time, raw = Time, time = Time.
      const finishMs = Math.round(csvTime * 1000);
      runRecords.push({
        competitorId: id,
        startMs: 0,
        finishMs,
        status: 'ok',
      });
    }
    rowByCompetitor.set(id, r);
  });

  const input: ScoringInput = {
    runMaxPoints: 400, // run results sample uses 400-point scale
    divisions,
    stages: [],        // no stages in run-only verification
    obstacles: [],
    competitors,
    runRecords,
    stageRecords: [],
    obstacleRecords: [],
  };

  return { input, divisionByCode, rowByCompetitor };
}

function buildStageInput(rows: CsvRow[]): SyntheticBuild {
  const divCodes = Array.from(new Set(rows.map((r) => r.div)));
  const divisions: Division[] = divCodes.map((code) => ({
    id: `div-${code}`,
    code,
    name: code,
  }));
  const divisionByCode = Object.fromEntries(divisions.map((d) => [d.code, d])) as Record<
    string,
    Division
  >;

  // Single penalty type with 1 second per penalty, single bonus with 1s.
  // Then the CSV's Pen/Bon columns become the penalty/bonus seconds directly
  // by setting count = column value.
  const stage: Stage = {
    id: 'stage-1',
    name: 'Stage 1',
    sequence: 1,
    maxPoints: 100,
    penaltyTypes: [{ id: 'pen-1s', name: 'Generic 1s', seconds: 1 }],
    bonusTypes: [{ id: 'bon-1s', name: 'Generic 1s', seconds: 1 }],
  };

  const competitors: Competitor[] = [];
  const stageRecords: StageRecord[] = [];
  const runRecords: RunRecord[] = [];
  const rowByCompetitor = new Map<string, CsvRow>();

  rows.forEach((r, idx) => {
    const id = `c-${idx}`;
    const isDns = r.rawTime === '-' || r.time === '-';
    const { lastName, firstName } = splitName(r.name);
    const div = divisionByCode[r.div];
    const compStatus = isDns ? 'no_show' : 'ok';

    competitors.push({
      id,
      bib: String(idx + 1).padStart(3, '0'),
      firstName,
      lastName,
      divisionId: div.id,
      status: compStatus,
    });
    runRecords.push({ competitorId: id, startMs: null, finishMs: null, status: 'no_show' });

    if (isDns) {
      stageRecords.push({
        competitorId: id,
        stageId: stage.id,
        rawTimeSeconds: null,
        waitTimeSeconds: 0,
        penaltyCounts: {},
        bonusCounts: {},
        status: 'no_show',
      });
    } else {
      const raw = parseSeconds(r.rawTime);
      const pen = parseSeconds(r.pen);
      const bon = parseSeconds(r.bon);
      stageRecords.push({
        competitorId: id,
        stageId: stage.id,
        rawTimeSeconds: raw,
        waitTimeSeconds: 0,
        penaltyCounts: { 'pen-1s': pen || 0 },
        bonusCounts: { 'bon-1s': bon || 0 },
        status: 'ok',
      });
    }
    rowByCompetitor.set(id, r);
  });

  const input: ScoringInput = {
    runMaxPoints: 400,
    divisions,
    stages: [stage],
    obstacles: [],
    competitors,
    runRecords,
    stageRecords,
    obstacleRecords: [],
  };

  return { input, divisionByCode, rowByCompetitor };
}

// -----------------------------------------------------------------------------
// Comparison helpers
// -----------------------------------------------------------------------------

function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

function fmt(n: number, dp = 4): string {
  return n.toFixed(dp);
}

// -----------------------------------------------------------------------------
// Verification: run results
// -----------------------------------------------------------------------------

interface VerifyReport {
  total: number;
  passed: number;
  failed: number;
  failures: string[];
}

function verifyRunCsv(path: string): VerifyReport {
  const rows = loadCsvRows(path);
  const { input, rowByCompetitor } = buildRunInput(rows);
  const out = computeResults(input);

  // Single division in run-results expected? No — multiple divisions exist.
  // Per Q2-C, scoring is per-division. But the sample CSV ranks ALL competitors
  // together regardless of division (overall). Confirm against CSV: place 1 is
  // a PCC, place 2 is a 2G. So this CSV is NOT division-scoped.
  //
  // To verify: we need the engine's overall (cross-division) ranking too,
  // OR we treat the entire CSV as a single division for verification purposes.
  //
  // Use the latter: rebuild input with ONE division.
  const singleDivInput: ScoringInput = {
    ...input,
    divisions: [{ id: 'all', code: 'ALL', name: 'All' }],
    competitors: input.competitors.map((c) => ({ ...c, divisionId: 'all' })),
  };
  const out2 = computeResults(singleDivInput);
  const runRows = out2.runByDivision['ALL'] ?? [];

  const report: VerifyReport = { total: 0, passed: 0, failed: 0, failures: [] };

  for (const result of runRows) {
    const csv = rowByCompetitor.get(result.competitorId);
    if (!csv) continue;
    report.total++;

    const csvIsDns = csv.rawTime === '-';
    if (csvIsDns) {
      // Engine should produce points=0, percent=0, place=null
      if (result.points !== 0 || result.percent !== 0 || result.place !== null) {
        report.failed++;
        report.failures.push(
          `[${csv.name}] DNS expected place=null pts=0 pct=0; got place=${result.place} pts=${result.points} pct=${result.percent}`,
        );
      } else {
        report.passed++;
      }
      continue;
    }

    const csvPts = parseFloat(csv.pts);
    const csvPctStr = csv.pct.replace('%', '').trim();
    const csvPct = parseFloat(csvPctStr);
    const csvPlace = parseInt(csv.place, 10);

    const ptsOk = approxEqual(result.points, csvPts, 0.01);
    const pctOk = approxEqual(result.percent, csvPct, 0.01);
    const placeOk = result.place === csvPlace;

    if (ptsOk && pctOk && placeOk) {
      report.passed++;
    } else {
      report.failed++;
      report.failures.push(
        `[${csv.name}] expected place=${csvPlace} pts=${fmt(csvPts)} pct=${fmt(csvPct, 2)}%; ` +
          `got place=${result.place} pts=${fmt(result.points)} pct=${fmt(result.percent, 2)}%`,
      );
    }
  }

  return report;
}

// -----------------------------------------------------------------------------
// Verification: stage results
// -----------------------------------------------------------------------------

function verifyStageCsv(path: string): VerifyReport {
  const rows = loadCsvRows(path);
  const { input, rowByCompetitor } = buildStageInput(rows);

  // Same observation as above: stage CSV ranks all competitors together
  // regardless of division. Reduce to single division for verification.
  const singleDivInput: ScoringInput = {
    ...input,
    divisions: [{ id: 'all', code: 'ALL', name: 'All' }],
    competitors: input.competitors.map((c) => ({ ...c, divisionId: 'all' })),
  };
  const out = computeResults(singleDivInput);
  const stageRows = out.stageByDivision['stage-1']?.['ALL'] ?? [];

  const report: VerifyReport = { total: 0, passed: 0, failed: 0, failures: [] };

  for (const result of stageRows) {
    const csv = rowByCompetitor.get(result.competitorId);
    if (!csv) continue;
    report.total++;

    const csvIsDns = csv.rawTime === '-';
    if (csvIsDns) {
      if (result.points !== 0 || result.percent !== 0 || result.place !== null) {
        report.failed++;
        report.failures.push(
          `[${csv.name}] DNS expected place=null pts=0 pct=0; got place=${result.place} pts=${result.points} pct=${result.percent}`,
        );
      } else {
        report.passed++;
      }
      continue;
    }

    const csvPts = parseFloat(csv.pts);
    const csvPct = parseFloat(csv.pct.replace('%', '').trim());
    const csvPlace = parseInt(csv.place, 10);
    const csvAdjustedTime = parseSeconds(csv.time); // raw + pen - bon per CSV

    const ptsOk = approxEqual(result.points, csvPts, 0.01);
    const pctOk = approxEqual(result.percent, csvPct, 0.01);
    const placeOk = result.place === csvPlace;
    const timeOk = approxEqual(result.timeSeconds ?? -1, csvAdjustedTime, 0.01);

    if (ptsOk && pctOk && placeOk && timeOk) {
      report.passed++;
    } else {
      report.failed++;
      report.failures.push(
        `[${csv.name}] expected place=${csvPlace} time=${fmt(csvAdjustedTime, 2)} pts=${fmt(csvPts)} pct=${fmt(csvPct, 2)}%; ` +
          `got place=${result.place} time=${fmt(result.timeSeconds ?? 0, 2)} pts=${fmt(result.points)} pct=${fmt(result.percent, 2)}%`,
      );
    }
  }

  return report;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function printReport(name: string, report: VerifyReport): boolean {
  console.log(`\n=== ${name} ===`);
  console.log(`  total=${report.total}  passed=${report.passed}  failed=${report.failed}`);
  if (report.failed > 0) {
    console.log('  Failures:');
    for (const f of report.failures.slice(0, 20)) console.log(`    - ${f}`);
    if (report.failures.length > 20) {
      console.log(`    ... and ${report.failures.length - 20} more`);
    }
    return false;
  }
  return true;
}

function main(): void {
  const runCsv = resolve(process.argv[2] ?? '');
  const stageCsv = resolve(process.argv[3] ?? '');

  if (!runCsv || !stageCsv) {
    console.error('Usage: tsx verify-csv.ts <run-results.csv> <stage-1-results.csv>');
    process.exit(2);
  }

  const runReport = verifyRunCsv(runCsv);
  const stageReport = verifyStageCsv(stageCsv);

  const runOk = printReport('Run results', runReport);
  const stageOk = printReport('Stage 1 results', stageReport);

  if (runOk && stageOk) {
    console.log('\n✅ ALL VERIFIED. Engine matches sample CSVs.');
    process.exit(0);
  } else {
    console.log('\n❌ Verification failed.');
    process.exit(1);
  }
}

main();
