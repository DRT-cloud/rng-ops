import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { matchApi, type PenType } from '../lib/api';
import OfflineBanner from '../components/OfflineBanner';

/**
 * Obstacle Tablet UI.
 *
 * Obstacles add penalties/bonuses to RUN time (not stage time). No raw or wait
 * time at this screen — just the +/- counters. Save returns to the list.
 */

interface Entry {
  competitorId: number;
  bib: string;
  firstName: string;
  lastName: string;
  divisionCode: string;
  matchStatus: 'registered' | 'checked_in' | 'no_show' | 'dq';
  scored: boolean;
}

export default function ObstacleTabletPage() {
  const [, params] = useRoute<{ id: string }>('/match/obstacle/:id');
  const obstacleId = Number(params?.id);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [obstacleName, setObstacleName] = useState('');
  const [eventId, setEventId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterDiv, setFilterDiv] = useState('all');
  const [search, setSearch] = useState('');
  const [showScored, setShowScored] = useState(false);

  async function refresh() {
    const r = await matchApi.obstacleEntries(obstacleId);
    setEntries(r.entries);
    setEventId(r.eventId);
    if (!obstacleName) {
      const d = await matchApi.getEvent(r.eventId);
      const o = d.obstacles.find((x) => x.id === obstacleId);
      setObstacleName(o ? `Obstacle ${o.sequence}: ${o.name}` : `Obstacle ${obstacleId}`);
    }
  }

  useEffect(() => { refresh(); }, [obstacleId]);

  const divisions = Array.from(new Set(entries.map((e) => e.divisionCode))).sort();
  const filtered = useMemo(() => entries.filter((e) => {
    if (e.matchStatus === 'no_show' || e.matchStatus === 'dq') return false;
    if (!showScored && e.scored) return false;
    if (filterDiv !== 'all' && e.divisionCode !== filterDiv) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!`${e.bib} ${e.firstName} ${e.lastName}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [entries, filterDiv, search, showScored]);

  if (selectedId != null) {
    return (
      <ObstacleScoreEditor
        obstacleId={obstacleId}
        obstacleName={obstacleName}
        competitorId={selectedId}
        onClose={() => { setSelectedId(null); refresh(); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#FAFAFA]">
      <header className="sticky top-0 z-10 bg-[#0A0A0B]/95 backdrop-blur border-b border-white/10 p-3 flex items-center gap-3">
        <Link href="/match"><a className="text-sm text-white/60 hover:text-white">← Hub</a></Link>
        <h1 className="font-semibold text-lg">{obstacleName}</h1>
        <div className="ml-auto flex gap-2 items-center">
          <select value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)}
            className="rounded bg-white/10 border border-white/20 px-3 py-2 text-sm">
            <option value="all">All Div</option>
            {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bib / name…"
            className="rounded bg-white/10 border border-white/20 px-3 py-2 text-sm w-40" />
          <label className="text-sm flex items-center gap-1 text-white/70">
            <input type="checkbox" checked={showScored} onChange={(e) => setShowScored(e.target.checked)} />
            Show scored
          </label>
        </div>
      </header>

      <div className="p-3">
        <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <div className="divide-y divide-white/5">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-white/40">
                {showScored ? 'No competitors match.' : 'No competitors pending. Toggle "Show scored" to edit.'}
              </div>
            )}
            {filtered.map((e) => (
              <button key={e.competitorId} onClick={() => setSelectedId(e.competitorId)}
                className="w-full text-left p-4 hover:bg-white/5 active:bg-white/10 flex items-center gap-4">
                <span className="font-mono text-2xl font-bold w-16">{e.bib}</span>
                <span className="flex-1 text-lg">{e.lastName}, {e.firstName}</span>
                <span className="font-mono text-sm text-white/60 w-16">{e.divisionCode}</span>
                {e.scored ? (
                  <span className="text-xs font-semibold px-2 py-1 rounded bg-green-500/30 text-green-300">SCORED</span>
                ) : (
                  <span className="text-xs text-white/40 w-16 text-right">→</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <OfflineBanner />
    </div>
  );
}

function ObstacleScoreEditor({
  obstacleId, obstacleName, competitorId, onClose,
}: { obstacleId: number; obstacleName: string; competitorId: number; onClose: () => void }) {
  const [data, setData] = useState<{
    competitor: { id: number; bib: string; first_name: string; last_name: string };
    penaltyCounts: Record<string, number>;
    bonusCounts: Record<string, number>;
    penaltyTypes: PenType[];
    bonusTypes: PenType[];
  } | null>(null);
  const [penCounts, setPenCounts] = useState<Record<number, number>>({});
  const [bonCounts, setBonCounts] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    matchApi.getObstacleEntry(competitorId, obstacleId).then((d) => {
      setData(d as any);
      const pc: Record<number, number> = {};
      const bc: Record<number, number> = {};
      for (const [k, v] of Object.entries(d.penaltyCounts)) pc[Number(k)] = v;
      for (const [k, v] of Object.entries(d.bonusCounts)) bc[Number(k)] = v;
      setPenCounts(pc);
      setBonCounts(bc);
    });
  }, [competitorId, obstacleId]);

  function bumpPen(id: number, delta: number) {
    setPenCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));
  }
  function bumpBon(id: number, delta: number) {
    setBonCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));
  }

  const netSeconds = useMemo(() => {
    if (!data) return 0;
    let s = 0;
    for (const p of data.penaltyTypes) s += (penCounts[p.id] || 0) * p.seconds;
    for (const b of data.bonusTypes) s -= (bonCounts[b.id] || 0) * b.seconds;
    return s;
  }, [data, penCounts, bonCounts]);

  async function save() {
    if (!data) return;
    setError(null);
    setSaving(true);
    try {
      await matchApi.saveObstacleEntry(competitorId, obstacleId, {
        penaltyCounts: penCounts, bonusCounts: bonCounts,
      });
      onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (!data) return <div className="min-h-screen bg-[#0A0A0B] text-white p-6">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#FAFAFA] flex flex-col">
      <header className="sticky top-0 z-10 bg-[#0A0A0B]/95 backdrop-blur border-b border-white/10 p-3 flex items-center gap-3">
        <button onClick={onClose} className="text-sm text-white/60 hover:text-white">← Back</button>
        <h1 className="font-semibold text-lg truncate">{obstacleName}</h1>
      </header>

      <div className="flex-1 p-4 max-w-3xl mx-auto w-full">
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/50 uppercase tracking-wide">Competitor</div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold">{data.competitor.bib}</span>
            <span className="text-xl">{data.competitor.last_name}, {data.competitor.first_name}</span>
          </div>
        </div>

        {data.penaltyTypes.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="text-sm font-medium text-red-300 mb-2">Penalties (added to run time)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.penaltyTypes.map((p) => (
                <CounterRow key={p.id} label={p.name} sublabel={`+${p.seconds}s`}
                  count={penCounts[p.id] || 0} onMinus={() => bumpPen(p.id, -1)} onPlus={() => bumpPen(p.id, 1)}
                  variant="penalty" />
              ))}
            </div>
          </div>
        )}

        {data.bonusTypes.length > 0 && (
          <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <div className="text-sm font-medium text-green-300 mb-2">Bonuses (subtracted from run time)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.bonusTypes.map((b) => (
                <CounterRow key={b.id} label={b.name} sublabel={`−${b.seconds}s`}
                  count={bonCounts[b.id] || 0} onMinus={() => bumpBon(b.id, -1)} onPlus={() => bumpBon(b.id, 1)}
                  variant="bonus" />
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 rounded-lg border-2 border-blue-500/40 bg-blue-500/10 p-4 flex items-baseline justify-between">
          <span className="text-sm font-medium text-white/80">Net adjustment to run time</span>
          <span className={`text-3xl font-mono font-bold tabular-nums ${netSeconds > 0 ? 'text-red-300' : netSeconds < 0 ? 'text-green-300' : ''}`}>
            {netSeconds > 0 ? '+' : ''}{netSeconds.toFixed(0)}s
          </span>
        </div>

        {error && <p className="mb-3 text-red-400 font-medium">{error}</p>}
      </div>

      <footer className="sticky bottom-0 bg-[#0A0A0B]/95 backdrop-blur border-t border-white/10 p-3">
        <div className="max-w-3xl mx-auto">
          <button onClick={save} disabled={saving}
            className="w-full py-5 rounded-lg bg-[#10B981] text-black text-lg font-bold active:scale-[0.98] disabled:opacity-50">
            {saving ? 'Saving…' : 'SAVE'}
          </button>
        </div>
      </footer>
      <OfflineBanner />
    </div>
  );
}

function CounterRow({
  label, sublabel, count, onMinus, onPlus, variant,
}: {
  label: string; sublabel: string; count: number;
  onMinus: () => void; onPlus: () => void;
  variant: 'penalty' | 'bonus';
}) {
  const accent = variant === 'penalty' ? 'bg-red-600' : 'bg-green-600';
  return (
    <div className="flex items-center gap-2 rounded bg-black/30 p-2">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-base truncate">{label}</div>
        <div className="text-xs text-white/50 font-mono">{sublabel}</div>
      </div>
      <button onClick={onMinus}
        className="w-12 h-12 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-2xl font-bold disabled:opacity-30"
        disabled={count === 0}>−</button>
      <span className="w-10 text-center text-2xl font-mono font-bold tabular-nums">{count}</span>
      <button onClick={onPlus}
        className={`w-12 h-12 rounded-lg ${accent} text-white text-2xl font-bold active:scale-[0.95]`}>+</button>
    </div>
  );
}
