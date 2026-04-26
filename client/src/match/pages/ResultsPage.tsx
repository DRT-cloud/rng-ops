import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import {
  matchApi,
  type EventDetail,
  type MatchTotalRow,
  type ResultsResponse,
  type RunResultRow,
  type StageResultRow,
} from '../lib/api';
import { downloadCsv, serializeCsv } from '../lib/csv';

/**
 * Results page (laptop, light theme).
 *
 * Supports per-division view of:
 *   - Run results
 *   - Stage results (one tab per stage)
 *   - Match totals (run + stage points)
 *
 * CSV export matches the sample format:
 *   "<Title>",,,,,,,,
 *   Place,Name,Div,Raw Time,Pen,Bon,Time,Stage Pts,Stage %
 */

type View = 'match' | 'run' | string; // stage:<id>

export default function ResultsPage() {
  const [, params] = useRoute<{ id: string }>('/match/results/:id');
  const eventId = Number(params?.id);

  const [resp, setResp] = useState<ResultsResponse | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [view, setView] = useState<View>('match');
  const [division, setDivision] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [r, d] = await Promise.all([matchApi.results(eventId), matchApi.getEvent(eventId)]);
      setResp(r);
      setDetail(d);
      const divs = Object.keys(r.results.matchByDivision);
      if (!division && divs.length > 0) setDivision(divs[0]);
    } catch (e: any) { setError(e.message); }
  }

  useEffect(() => { load(); }, [eventId]);

  const divisions = resp ? Object.keys(resp.results.matchByDivision).sort() : [];

  const stageList = useMemo(() => {
    if (!detail) return [];
    return [...detail.stages].sort((a, b) => a.sequence - b.sequence);
  }, [detail]);

  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!resp || !detail) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-6xl mx-auto">
      <Link href="/match"><a className="text-sm text-muted-foreground hover:underline">← Match Hub</a></Link>
      <header className="mt-2 mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Results — {resp.event.name}</h1>
          <p className="text-muted-foreground">{resp.event.event_date}</p>
        </div>
        <button onClick={load} className="px-3 py-2 text-sm rounded border hover:bg-accent">↻ Refresh</button>
      </header>

      {/* Division selector */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Division:</span>
        {divisions.map((d) => (
          <button key={d} onClick={() => setDivision(d)}
            className={`px-3 py-1 rounded text-sm font-medium ${division === d ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'}`}>
            {d}
          </button>
        ))}
      </div>

      {/* View tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b">
        <Tab active={view === 'match'} onClick={() => setView('match')}>Match Total</Tab>
        <Tab active={view === 'run'} onClick={() => setView('run')}>Run</Tab>
        {stageList.map((s) => (
          <Tab key={s.id} active={view === `stage:${s.id}`} onClick={() => setView(`stage:${s.id}`)}>
            Stage {s.sequence}
          </Tab>
        ))}
      </div>

      {division && (
        <ResultsView resp={resp} detail={detail} view={view} division={division} />
      )}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
      {children}
    </button>
  );
}

function ResultsView({
  resp, detail, view, division,
}: { resp: ResultsResponse; detail: EventDetail; view: View; division: string }) {
  if (view === 'match') return <MatchView resp={resp} detail={detail} division={division} />;
  if (view === 'run') return <RunView resp={resp} division={division} eventName={resp.event.name} />;
  if (view.startsWith('stage:')) {
    const stageId = view.slice('stage:'.length);
    const stage = detail.stages.find((s) => String(s.id) === stageId);
    if (!stage) return <p>Stage not found</p>;
    return <StageView resp={resp} division={division} stageId={stageId} stageName={`Stage ${stage.sequence}: ${stage.name}`} eventName={resp.event.name} />;
  }
  return null;
}

// ----- Run view -----

function RunView({ resp, division, eventName }: { resp: ResultsResponse; division: string; eventName: string }) {
  const rows = resp.results.runByDivision[division] ?? [];

  function exportCsv() {
    const csv: (string | number)[][] = [
      ['Run Results', '', '', '', '', '', '', '', ''],
      ['Place', 'Name', 'Div', 'Raw Time', 'Pen', 'Bon', 'Time', 'Stage Pts', 'Stage %'],
      ...rows.map((r) => [
        r.place ?? '',
        r.name,
        r.divisionCode,
        formatTimeRaw(r.rawTimeSeconds),
        formatPenBon(r.penaltySeconds),
        formatPenBon(r.bonusSeconds),
        formatTimeRaw(r.timeSeconds),
        r.points.toFixed(0),
        `${r.percent.toFixed(2)}%`,
      ]),
    ];
    downloadCsv(`${eventName.replace(/\s+/g, '_')}_${division}_run.csv`, serializeCsv(csv));
  }

  return (
    <ResultsTable
      title={`Run — ${division}`}
      headers={['Place', 'Name', 'Div', 'Raw Time', 'Pen', 'Bon', 'Time', 'Pts', '%']}
      rows={rows.map((r) => [
        r.place != null ? String(r.place) : '—',
        r.name,
        r.divisionCode,
        formatTimeDisplay(r.rawTimeSeconds, r.status),
        formatNum(r.penaltySeconds),
        formatNum(r.bonusSeconds),
        formatTimeDisplay(r.timeSeconds, r.status),
        r.points.toFixed(0),
        `${r.percent.toFixed(2)}%`,
      ])}
      onExport={exportCsv}
    />
  );
}

// ----- Stage view -----

function StageView({
  resp, division, stageId, stageName, eventName,
}: { resp: ResultsResponse; division: string; stageId: string; stageName: string; eventName: string }) {
  const rows = resp.results.stageByDivision[stageId]?.[division] ?? [];

  function exportCsv() {
    const csv: (string | number)[][] = [
      [`${stageName} Results`, '', '', '', '', '', '', '', ''],
      ['Place', 'Name', 'Div', 'Raw Time', 'Pen', 'Bon', 'Stage Time', 'Stage Pts', 'Stage %'],
      ...rows.map((r) => [
        r.place ?? '',
        r.name,
        r.divisionCode,
        formatTimeRaw(r.rawTimeSeconds),
        formatPenBon(r.penaltySeconds),
        formatPenBon(r.bonusSeconds),
        formatTimeRaw(r.timeSeconds),
        r.points.toFixed(0),
        `${r.percent.toFixed(2)}%`,
      ]),
    ];
    downloadCsv(
      `${eventName.replace(/\s+/g, '_')}_${division}_${stageName.replace(/\s+/g, '_')}.csv`,
      serializeCsv(csv),
    );
  }

  return (
    <ResultsTable
      title={`${stageName} — ${division}`}
      headers={['Place', 'Name', 'Div', 'Raw Time', 'Pen', 'Bon', 'Stage Time', 'Pts', '%']}
      rows={rows.map((r) => [
        r.place != null ? String(r.place) : '—',
        r.name,
        r.divisionCode,
        formatTimeDisplay(r.rawTimeSeconds, r.status),
        formatNum(r.penaltySeconds),
        formatNum(r.bonusSeconds),
        formatTimeDisplay(r.timeSeconds, r.status),
        r.points.toFixed(0),
        `${r.percent.toFixed(2)}%`,
      ])}
      onExport={exportCsv}
    />
  );
}

// ----- Match view -----

function MatchView({ resp, detail, division }: { resp: ResultsResponse; detail: EventDetail; division: string }) {
  const rows = resp.results.matchByDivision[division] ?? [];
  const stageList = [...detail.stages].sort((a, b) => a.sequence - b.sequence);

  function exportCsv() {
    const headers = ['Place', 'Bib', 'Name', 'Div', 'Run Pts', ...stageList.map((s) => `S${s.sequence} Pts`), 'Total'];
    const csv: (string | number)[][] = [
      [`Match Total — ${division}`, ...Array(headers.length - 1).fill('')],
      headers,
      ...rows.map((r) => [
        r.place ?? '',
        r.bib,
        r.name,
        r.divisionCode,
        r.runPoints.toFixed(0),
        ...stageList.map((s) => (r.stagePoints[String(s.id)] ?? 0).toFixed(0)),
        r.totalPoints.toFixed(2),
      ]),
    ];
    downloadCsv(
      `${resp.event.name.replace(/\s+/g, '_')}_${division}_match.csv`,
      serializeCsv(csv),
    );
  }

  return (
    <div className="rounded border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b bg-muted/40">
        <h3 className="font-semibold">Match Total — {division}</h3>
        <button onClick={exportCsv} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-2 w-12">Place</th>
              <th className="text-left p-2 w-16">Bib</th>
              <th className="text-left p-2">Name</th>
              <th className="text-right p-2">Run</th>
              {stageList.map((s) => <th key={s.id} className="text-right p-2">S{s.sequence}</th>)}
              <th className="text-right p-2 font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5 + stageList.length} className="p-6 text-center text-muted-foreground">No competitors in this division.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.competitorId} className="border-t">
                <td className="p-2 font-mono">{r.place ?? '—'}</td>
                <td className="p-2 font-mono">{r.bib}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right font-mono">{r.runPoints.toFixed(0)}</td>
                {stageList.map((s) => (
                  <td key={s.id} className="p-2 text-right font-mono">
                    {(r.stagePoints[String(s.id)] ?? 0).toFixed(0)}
                  </td>
                ))}
                <td className="p-2 text-right font-mono font-bold">{r.totalPoints.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- Generic table -----

function ResultsTable({
  title, headers, rows, onExport,
}: { title: string; headers: string[]; rows: string[][]; onExport: () => void }) {
  return (
    <div className="rounded border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b bg-muted/40">
        <h3 className="font-semibold">{title}</h3>
        <button onClick={onExport} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={`p-2 ${i === 1 ? 'text-left' : i === 0 || i === 2 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={headers.length} className="p-6 text-center text-muted-foreground">No results.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((c, j) => (
                  <td key={j} className={`p-2 font-mono ${j === 1 ? 'font-sans' : ''} ${j === 1 || j === 0 || j === 2 ? 'text-left' : 'text-right'}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- formatters -----

/** Format raw time like the sample CSV: SS.cc, with thousands commas for runs. */
function formatTimeRaw(s: number | null): string {
  if (s == null) return '';
  return s.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatPenBon(s: number): string {
  if (s === 0) return '0';
  return s.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function formatNum(s: number): string {
  return s === 0 ? '0' : s.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function formatTimeDisplay(s: number | null, status: 'ok' | 'no_show' | 'dq'): string {
  if (status === 'dq') return 'DQ';
  if (status === 'no_show') return 'DNS';
  if (s == null) return '—';
  return formatTimeRaw(s);
}
