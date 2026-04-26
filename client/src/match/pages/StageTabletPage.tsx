import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { matchApi, type StageEntryRow, type StageEntryDetail } from '../lib/api';
import { fmtTime, parseTimeFlexible } from '../lib/time';
import OfflineBanner from '../components/OfflineBanner';

/**
 * Stage Tablet UI — the core RO scoring screen.
 *
 * Dark theme, high-contrast, large touch targets. Operator workflow:
 *   1. Pick competitor from list
 *   2. Enter Raw Time (SS.cc or MM:SS.cc)
 *   3. Enter Wait Time (MM:SS)
 *   4. Tap penalty/bonus buttons to add counts
 *   5. Live preview of adjusted stage time
 *   6. SAVE | NO SHOW | DQ
 *
 *   Time = Raw + Σ(pen × count) − Σ(bon × count), floored at 0.
 *   Wait time is recorded but subtracted from RUN time later.
 */

export default function StageTabletPage() {
  const [, params] = useRoute<{ id: string }>('/match/stage/:id');
  const stageId = Number(params?.id);

  const [entries, setEntries] = useState<StageEntryRow[]>([]);
  const [eventId, setEventId] = useState<number | null>(null);
  const [stageName, setStageName] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterDiv, setFilterDiv] = useState('all');
  const [search, setSearch] = useState('');
  const [showScored, setShowScored] = useState(false);

  async function refresh() {
    const r = await matchApi.stageEntries(stageId);
    setEntries(r.entries);
    setEventId(r.eventId);
    if (!stageName) {
      const d = await matchApi.getEvent(r.eventId);
      const stage = d.stages.find((s) => s.id === stageId);
      setStageName(stage ? `Stage ${stage.sequence}: ${stage.name}` : `Stage ${stageId}`);
    }
  }

  useEffect(() => { refresh(); }, [stageId]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (e.matchStatus === 'no_show' || e.matchStatus === 'dq') return false;
      if (!showScored && e.scored) return false;
      if (filterDiv !== 'all' && e.divisionCode !== filterDiv) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${e.bib} ${e.firstName} ${e.lastName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, filterDiv, search, showScored]);

  const divisions = Array.from(new Set(entries.map((e) => e.divisionCode))).sort();

  if (selectedId != null) {
    return (
      <StageScoreEditor
        stageId={stageId}
        stageName={stageName}
        competitorId={selectedId}
        onClose={() => { setSelectedId(null); refresh(); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#FAFAFA]">
      <header className="sticky top-0 z-10 bg-[#0A0A0B]/95 backdrop-blur border-b border-white/10 p-3 flex items-center gap-3">
        <Link href="/match"><a className="text-sm text-white/60 hover:text-white">← Hub</a></Link>
        <h1 className="font-semibold text-lg">{stageName}</h1>
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
                {showScored ? 'No competitors match.' : 'All competitors have been scored. Toggle "Show scored" to edit.'}
              </div>
            )}
            {filtered.map((e) => (
              <button key={e.competitorId} onClick={() => setSelectedId(e.competitorId)}
                className="w-full text-left p-4 hover:bg-white/5 active:bg-white/10 flex items-center gap-4">
                <span className="font-mono text-2xl font-bold w-16">{e.bib}</span>
                <span className="flex-1 text-lg">{e.lastName}, {e.firstName}</span>
                <span className="font-mono text-sm text-white/60 w-16">{e.divisionCode}</span>
                {e.scored ? (
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    e.stageStatus === 'dq' ? 'bg-red-500/30 text-red-300' :
                    e.stageStatus === 'no_show' ? 'bg-amber-500/30 text-amber-300' :
                    'bg-green-500/30 text-green-300'
                  }`}>
                    {e.stageStatus === 'ok' ? 'SCORED' : e.stageStatus?.toUpperCase()}
                  </span>
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

// -----------------------------------------------------------------------------
// Score editor
// -----------------------------------------------------------------------------

function StageScoreEditor({
  stageId, stageName, competitorId, onClose,
}: { stageId: number; stageName: string; competitorId: number; onClose: () => void }) {
  const [data, setData] = useState<StageEntryDetail | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [waitMin, setWaitMin] = useState('');
  const [waitSec, setWaitSec] = useState('');
  const [penCounts, setPenCounts] = useState<Record<number, number>>({});
  const [bonCounts, setBonCounts] = useState<Record<number, number>>({});
  const [status, setStatus] = useState<'ok' | 'no_show' | 'dq'>('ok');
  const [dqArmed, setDqArmed] = useState(false);
  const dqTimer = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    matchApi.getStageEntry(competitorId, stageId).then((d) => {
      setData(d);
      if (d.record) {
        setRawInput(d.record.raw_time_seconds != null ? String(d.record.raw_time_seconds) : '');
        const ws = d.record.wait_time_seconds || 0;
        setWaitMin(String(Math.floor(ws / 60)).padStart(2, '0'));
        setWaitSec(String(ws % 60).padStart(2, '0'));
        setStatus(d.record.status);
        const pc: Record<number, number> = {};
        const bc: Record<number, number> = {};
        for (const [k, v] of Object.entries(d.penaltyCounts)) pc[Number(k)] = v;
        for (const [k, v] of Object.entries(d.bonusCounts)) bc[Number(k)] = v;
        setPenCounts(pc);
        setBonCounts(bc);
      } else {
        setWaitMin('00'); setWaitSec('00');
      }
    });
  }, [competitorId, stageId]);

  // Live preview
  const preview = useMemo(() => {
    if (!data) return null;
    const raw = parseTimeFlexible(rawInput);
    if (raw == null) return null;
    let total = raw;
    for (const p of data.penaltyTypes) total += (penCounts[p.id] || 0) * p.seconds;
    for (const b of data.bonusTypes) total -= (bonCounts[b.id] || 0) * b.seconds;
    return Math.max(0, total);
  }, [data, rawInput, penCounts, bonCounts]);

  function bumpPen(id: number, delta: number) {
    setPenCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));
  }
  function bumpBon(id: number, delta: number) {
    setBonCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));
  }

  function armDq() {
    if (dqArmed) {
      // Confirm
      doSave('dq');
      return;
    }
    setDqArmed(true);
    if (dqTimer.current) clearTimeout(dqTimer.current);
    dqTimer.current = window.setTimeout(() => setDqArmed(false), 3000);
  }

  async function doSave(forceStatus?: 'ok' | 'no_show' | 'dq') {
    if (!data) return;
    setError(null);
    const finalStatus = forceStatus ?? status;
    let raw: number | null = null;
    let waitSeconds = 0;
    if (finalStatus === 'ok') {
      raw = parseTimeFlexible(rawInput);
      if (raw == null) { setError('Enter a valid raw time'); return; }
      const wm = parseInt(waitMin || '0', 10);
      const ws = parseInt(waitSec || '0', 10);
      if (!Number.isFinite(wm) || !Number.isFinite(ws) || ws >= 60) { setError('Wait time must be MM:SS, seconds < 60'); return; }
      waitSeconds = wm * 60 + ws;
    }
    setSaving(true);
    try {
      await matchApi.saveStageEntry(competitorId, stageId, {
        rawTimeSeconds: finalStatus === 'ok' ? raw : null,
        waitTimeSeconds: waitSeconds,
        status: finalStatus,
        penaltyCounts: finalStatus === 'ok' ? penCounts : {},
        bonusCounts: finalStatus === 'ok' ? bonCounts : {},
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
        <h1 className="font-semibold text-lg truncate">{stageName}</h1>
      </header>

      <div className="flex-1 p-4 max-w-3xl mx-auto w-full">
        {/* Competitor */}
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/50 uppercase tracking-wide">Competitor</div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold">{data.competitor.bib}</span>
            <span className="text-xl">{data.competitor.last_name}, {data.competitor.first_name}</span>
          </div>
        </div>

        {/* Raw time */}
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <label className="block">
            <span className="text-sm font-medium text-white/80">Raw Time</span>
            <input value={rawInput} onChange={(e) => setRawInput(e.target.value)}
              inputMode="decimal" placeholder="SS.cc or MM:SS.cc"
              className="mt-2 w-full rounded-lg bg-black/40 border-2 border-white/20 px-4 py-4 text-3xl font-mono focus:border-blue-400 outline-none" />
          </label>
        </div>

        {/* Wait time MM:SS */}
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <span className="text-sm font-medium text-white/80">Wait Time (MM:SS)</span>
          <div className="mt-2 flex items-center gap-2">
            <input value={waitMin} onChange={(e) => setWaitMin(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric" maxLength={3} placeholder="00"
              className="w-24 rounded-lg bg-black/40 border-2 border-white/20 px-3 py-3 text-center text-3xl font-mono focus:border-blue-400 outline-none" />
            <span className="text-3xl font-mono">:</span>
            <input value={waitSec} onChange={(e) => setWaitSec(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric" maxLength={2} placeholder="00"
              className="w-20 rounded-lg bg-black/40 border-2 border-white/20 px-3 py-3 text-center text-3xl font-mono focus:border-blue-400 outline-none" />
            <span className="ml-3 text-xs text-white/50">Wait time is subtracted from run time, not stage time.</span>
          </div>
        </div>

        {/* Penalties */}
        {data.penaltyTypes.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="text-sm font-medium text-red-300 mb-2">Penalties (added to stage time)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.penaltyTypes.map((p) => (
                <CounterRow key={p.id} label={p.name} sublabel={`+${p.seconds}s`}
                  count={penCounts[p.id] || 0} onMinus={() => bumpPen(p.id, -1)} onPlus={() => bumpPen(p.id, 1)} variant="penalty" />
              ))}
            </div>
          </div>
        )}

        {/* Bonuses */}
        {data.bonusTypes.length > 0 && (
          <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <div className="text-sm font-medium text-green-300 mb-2">Bonuses (subtracted from stage time)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.bonusTypes.map((b) => (
                <CounterRow key={b.id} label={b.name} sublabel={`−${b.seconds}s`}
                  count={bonCounts[b.id] || 0} onMinus={() => bumpBon(b.id, -1)} onPlus={() => bumpBon(b.id, 1)} variant="bonus" />
              ))}
            </div>
          </div>
        )}

        {/* Live preview */}
        <div className="mb-4 rounded-lg border-2 border-blue-500/40 bg-blue-500/10 p-4 flex items-baseline justify-between">
          <span className="text-sm font-medium text-white/80">Adjusted Stage Time</span>
          <span className="text-4xl font-mono font-bold tabular-nums">
            {preview != null ? fmtTime(preview) : '—'}
          </span>
        </div>

        {error && <p className="mb-3 text-red-400 font-medium">{error}</p>}
      </div>

      {/* Sticky action bar */}
      <footer className="sticky bottom-0 bg-[#0A0A0B]/95 backdrop-blur border-t border-white/10 p-3">
        <div className="grid grid-cols-3 gap-3 max-w-3xl mx-auto">
          <button onClick={() => doSave('no_show')} disabled={saving}
            className="py-5 rounded-lg bg-[#F59E0B] text-black text-lg font-bold active:scale-[0.98] disabled:opacity-50">
            NO SHOW
          </button>
          <button onClick={() => doSave('ok')} disabled={saving || preview == null}
            className="py-5 rounded-lg bg-[#10B981] text-black text-lg font-bold active:scale-[0.98] disabled:opacity-50">
            {saving ? 'Saving…' : 'SAVE'}
          </button>
          <button onClick={armDq} disabled={saving}
            className={`py-5 rounded-lg text-lg font-bold active:scale-[0.98] disabled:opacity-50 ${
              dqArmed ? 'bg-[#EF4444] text-white animate-pulse' : 'bg-[#EF4444]/40 text-red-100 border-2 border-[#EF4444]'
            }`}>
            {dqArmed ? 'TAP AGAIN: DQ' : 'DQ'}
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
