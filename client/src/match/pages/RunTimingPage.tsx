import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { matchApi, type Competitor, type EventDetail } from '../lib/api';
import { fmtTime } from '../lib/time';
import OfflineBanner from '../components/OfflineBanner';

/**
 * Run Start/Finish tablet UI.
 *
 * Operator selects a competitor, then taps START or FINISH. Both stamp the
 * device's current time (Date.now()) on the server. The screen also surfaces
 * the on-device elapsed time for in-progress runs.
 *
 * Dark, high-contrast for outdoor / stress use.
 */

interface RunRow {
  competitor: Competitor;
  divisionCode: string;
  startMs: number | null;
  finishMs: number | null;
  status: 'ok' | 'no_show' | 'dq';
}

export default function RunTimingPage() {
  const [, params] = useRoute<{ id: string }>('/match/run/:id');
  const eventId = Number(params?.id);

  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [filterDiv, setFilterDiv] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const d = await matchApi.getEvent(eventId);
    setDetail(d);
    const competitors = await matchApi.listCompetitors(eventId);
    const divByCode = new Map(d.divisions.map((dv) => [dv.id, dv.code]));
    try {
      const runMap = await matchApi.listRuns(eventId);
      setRows(
        competitors.map((c) => ({
          competitor: c,
          divisionCode: divByCode.get(c.division_id) ?? '',
          startMs: runMap[c.id]?.start_ms ?? null,
          finishMs: runMap[c.id]?.finish_ms ?? null,
          status: runMap[c.id]?.status ?? 'ok',
        })),
      );
    } catch {
      setRows(competitors.map((c) => ({
        competitor: c, divisionCode: divByCode.get(c.division_id) ?? '',
        startMs: null, finishMs: null, status: 'ok',
      })));
    }
  }

  useEffect(() => { refresh(); }, [eventId]);

  // Tick for elapsed timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.competitor.status === 'no_show' || r.competitor.status === 'dq') return false;
      if (filterDiv !== 'all' && r.divisionCode !== filterDiv) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${r.competitor.bib} ${r.competitor.first_name} ${r.competitor.last_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterDiv, search]);

  const selected = rows.find((r) => r.competitor.id === selectedId);

  async function start() {
    if (!selected) return;
    try { await matchApi.runStart(selected.competitor.id); refresh(); }
    catch (e: any) { setError(e.message); }
  }
  async function finish() {
    if (!selected) return;
    try { await matchApi.runFinish(selected.competitor.id); refresh(); }
    catch (e: any) { setError(e.message); }
  }
  async function clearTimes() {
    if (!selected) return;
    if (!confirm('Clear start and finish times?')) return;
    await matchApi.runSet(selected.competitor.id, { startMs: null, finishMs: null, status: 'ok' });
    refresh();
  }

  if (!detail) return <div className="min-h-screen bg-[#0A0A0B] text-white p-6">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#FAFAFA]">
      <header className="sticky top-0 z-10 bg-[#0A0A0B]/95 backdrop-blur border-b border-white/10 p-3 flex items-center gap-3">
        <Link href="/match"><a className="text-sm text-white/60 hover:text-white">← Hub</a></Link>
        <h1 className="font-semibold text-lg">Run Timing — {detail.event.name}</h1>
        <div className="ml-auto flex gap-2">
          <select value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)}
            className="rounded bg-white/10 border border-white/20 px-3 py-2 text-sm">
            <option value="all">All Div</option>
            {detail.divisions.map((d) => <option key={d.id} value={d.code}>{d.code}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bib / name…"
            className="rounded bg-white/10 border border-white/20 px-3 py-2 text-sm w-40" />
        </div>
      </header>

      {error && <p className="m-3 text-red-400">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3">
        {/* Competitor list */}
        <div className="md:col-span-2 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-base">
            <thead className="bg-white/10">
              <tr>
                <th className="text-left p-2 w-20">Bib</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2 w-20">Div</th>
                <th className="text-right p-2 w-32">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const sel = r.competitor.id === selectedId;
                let label = '—';
                let color = 'text-white/40';
                if (r.startMs && r.finishMs) {
                  label = fmtTime((r.finishMs - r.startMs) / 1000);
                  color = 'text-green-400';
                } else if (r.startMs) {
                  label = fmtTime((now - r.startMs) / 1000);
                  color = 'text-yellow-400 animate-pulse';
                }
                return (
                  <tr key={r.competitor.id}
                    onClick={() => setSelectedId(r.competitor.id)}
                    className={`border-t border-white/5 cursor-pointer ${sel ? 'bg-blue-600/30' : 'hover:bg-white/5'}`}>
                    <td className="p-3 font-mono font-bold text-lg">{r.competitor.bib}</td>
                    <td className="p-3">{r.competitor.last_name}, {r.competitor.first_name}</td>
                    <td className="p-3 font-mono text-sm">{r.divisionCode}</td>
                    <td className={`p-3 text-right font-mono ${color}`}>{label}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-white/40">No competitors checked in.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Action panel */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 sticky top-20 self-start">
          {selected ? (
            <>
              <div className="text-sm text-white/60">Selected</div>
              <div className="text-2xl font-bold mb-1">#{selected.competitor.bib} {selected.competitor.last_name}, {selected.competitor.first_name}</div>
              <div className="text-sm text-white/60 mb-4">Division {selected.divisionCode}</div>

              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                <div className="rounded bg-black/30 p-2">
                  <div className="text-white/50 text-xs">Start</div>
                  <div className="font-mono">{selected.startMs ? new Date(selected.startMs).toLocaleTimeString() : '—'}</div>
                </div>
                <div className="rounded bg-black/30 p-2">
                  <div className="text-white/50 text-xs">Finish</div>
                  <div className="font-mono">{selected.finishMs ? new Date(selected.finishMs).toLocaleTimeString() : '—'}</div>
                </div>
              </div>

              <div className="space-y-2">
                <button onClick={start}
                  disabled={!!selected.startMs && !selected.finishMs}
                  className="w-full py-6 rounded-lg bg-[#10B981] text-black text-2xl font-bold disabled:opacity-30 active:scale-[0.98]">
                  START
                </button>
                <button onClick={finish}
                  disabled={!selected.startMs || !!selected.finishMs}
                  className="w-full py-6 rounded-lg bg-[#3B82F6] text-white text-2xl font-bold disabled:opacity-30 active:scale-[0.98]">
                  FINISH
                </button>
                <button onClick={clearTimes}
                  className="w-full py-3 rounded-lg border border-white/20 text-sm hover:bg-white/10">
                  Clear times
                </button>
              </div>
            </>
          ) : (
            <p className="text-white/40 text-center py-12">Tap a competitor to begin.</p>
          )}
        </div>
      </div>
      <OfflineBanner />
    </div>
  );
}
