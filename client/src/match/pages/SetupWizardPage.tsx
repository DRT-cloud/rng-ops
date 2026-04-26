import { useEffect, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { matchApi, type EventDetail } from '../lib/api';

const DEFAULT_DIVISIONS = [
  { code: '2G', name: '2-Gun' },
  { code: 'PCC', name: 'Pistol Caliber Carbine' },
  { code: 'NV2G', name: 'Night Vision 2-Gun' },
  { code: 'NVPCC', name: 'Night Vision PCC' },
];

const DEFAULT_STAGE_PENALTIES = [
  { name: 'Procedural', seconds: 5 },
  { name: 'Miss', seconds: 10 },
  { name: 'No-shoot', seconds: 30 },
];

const DEFAULT_STAGE_BONUSES = [
  { name: 'Bonus Hit', seconds: 5 },
];

export default function SetupWizardPage() {
  const [, params] = useRoute<{ id: string }>('/match/setup/:id');
  const [, navigate] = useLocation();
  const isNew = params?.id === 'new';
  const eventId = isNew ? null : Number(params?.id);

  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New event form
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  async function refresh() {
    if (!eventId) return;
    setLoading(true);
    try {
      const d = await matchApi.getEvent(eventId);
      setDetail(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isNew && eventId) refresh();
  }, [eventId, isNew]);

  async function createEvent() {
    setError(null);
    try {
      const ev = await matchApi.createEvent({ name: newName, eventDate: newDate });
      // Seed divisions
      for (let i = 0; i < DEFAULT_DIVISIONS.length; i++) {
        await matchApi.createDivision(ev.id, { ...DEFAULT_DIVISIONS[i], sortOrder: i });
      }
      await matchApi.activateEvent(ev.id);
      navigate(`/match/setup/${ev.id}`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (isNew) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 max-w-2xl mx-auto">
        <Link href="/match"><a className="text-sm text-muted-foreground hover:underline">← Match Hub</a></Link>
        <h1 className="text-3xl font-semibold mt-2 mb-6">New Event</h1>
        {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Event Name</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 bg-background"
              placeholder="e.g. Twilight Match Spring 2026" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Date</span>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 bg-background" />
          </label>
          <p className="text-sm text-muted-foreground">
            Defaults to creating divisions: {DEFAULT_DIVISIONS.map(d => d.code).join(', ')}.
            You can edit these and add stages/obstacles after creation.
          </p>
          <button onClick={createEvent} disabled={!newName.trim() || !newDate}
            className="px-4 py-2 rounded bg-primary text-primary-foreground font-medium disabled:opacity-50">
            Create Event
          </button>
        </div>
      </div>
    );
  }

  if (loading || !detail) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-5xl mx-auto">
      <Link href="/match"><a className="text-sm text-muted-foreground hover:underline">← Match Hub</a></Link>
      <header className="mt-2 mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{detail.event.name}</h1>
          <p className="text-muted-foreground">{detail.event.event_date}</p>
        </div>
        <div className="space-x-2">
          {!detail.event.is_active && (
            <button onClick={async () => { await matchApi.activateEvent(detail.event.id); refresh(); }}
              className="px-3 py-2 text-sm rounded border hover:bg-accent">Activate</button>
          )}
          <Link href={`/match/registration/${detail.event.id}`}>
            <a className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground inline-block">Registration →</a>
          </Link>
        </div>
      </header>

      {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}

      <DivisionsSection detail={detail} onChange={refresh} />
      <StagesSection detail={detail} onChange={refresh} />
      <ObstaclesSection detail={detail} onChange={refresh} />
    </div>
  );
}

function DivisionsSection({ detail, onChange }: { detail: EventDetail; onChange: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  async function add() {
    if (!code.trim() || !name.trim()) return;
    await matchApi.createDivision(detail.event.id, { code: code.trim(), name: name.trim() });
    setCode(''); setName('');
    onChange();
  }

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">Divisions</h2>
      <div className="rounded border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr>
            <th className="text-left p-2 w-32">Code</th>
            <th className="text-left p-2">Name</th>
            <th className="text-right p-2 w-20"></th>
          </tr></thead>
          <tbody>
            {detail.divisions.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="p-2 font-mono font-medium">{d.code}</td>
                <td className="p-2">{d.name}</td>
                <td className="p-2 text-right">
                  <button onClick={async () => { await matchApi.deleteDivision(d.id); onChange(); }}
                    className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            <tr className="border-t">
              <td className="p-2"><input value={code} onChange={(e) => setCode(e.target.value)}
                className="w-full rounded border px-2 py-1 bg-background" placeholder="2G" /></td>
              <td className="p-2"><input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded border px-2 py-1 bg-background" placeholder="2-Gun" /></td>
              <td className="p-2 text-right">
                <button onClick={add} className="text-primary hover:underline text-xs">Add</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StagesSection({ detail, onChange }: { detail: EventDetail; onChange: () => void }) {
  const [name, setName] = useState('');

  async function addStage() {
    if (!name.trim()) return;
    const seq = (detail.stages.at(-1)?.sequence ?? 0) + 1;
    const stage = await matchApi.createStage(detail.event.id, { name: name.trim(), sequence: seq });
    // Seed default penalties
    for (let i = 0; i < DEFAULT_STAGE_PENALTIES.length; i++) {
      await matchApi.addStagePenalty(stage.id, { ...DEFAULT_STAGE_PENALTIES[i], sortOrder: i });
    }
    for (let i = 0; i < DEFAULT_STAGE_BONUSES.length; i++) {
      await matchApi.addStageBonus(stage.id, { ...DEFAULT_STAGE_BONUSES[i], sortOrder: i });
    }
    setName('');
    onChange();
  }

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">Stages</h2>
      <div className="space-y-3">
        {detail.stages.map((s) => (
          <StageCard key={s.id} stage={s} onChange={onChange} />
        ))}
        <div className="rounded border p-3 bg-muted/30 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border px-3 py-2 bg-background" placeholder="New stage name (e.g. Stage 4)" />
          <button onClick={addStage} className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm">+ Add Stage</button>
        </div>
      </div>
    </section>
  );
}

function StageCard({ stage, onChange }: { stage: EventDetail['stages'][number]; onChange: () => void }) {
  const [pname, setPname] = useState('');
  const [psec, setPsec] = useState('');
  const [bname, setBname] = useState('');
  const [bsec, setBsec] = useState('');

  return (
    <div className="rounded border p-4 bg-card">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-medium">Stage {stage.sequence}: {stage.name} <span className="text-muted-foreground text-xs">({stage.max_points} pts)</span></h3>
        <button onClick={async () => { if (confirm('Delete this stage?')) { await matchApi.deleteStage(stage.id); onChange(); } }}
          className="text-red-600 hover:underline text-xs">Delete stage</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium mb-1">Penalties (added to time)</h4>
          <ul className="text-sm space-y-1">
            {stage.penaltyTypes.map((p) => <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className="font-mono">+{p.seconds}s</span></li>)}
          </ul>
          <div className="flex gap-1 mt-2">
            <input value={pname} onChange={(e) => setPname(e.target.value)} placeholder="Name" className="flex-1 text-xs rounded border px-2 py-1 bg-background" />
            <input value={psec} onChange={(e) => setPsec(e.target.value)} placeholder="sec" className="w-16 text-xs rounded border px-2 py-1 bg-background" />
            <button onClick={async () => {
              const sec = parseFloat(psec);
              if (!pname.trim() || !Number.isFinite(sec)) return;
              await matchApi.addStagePenalty(stage.id, { name: pname.trim(), seconds: sec });
              setPname(''); setPsec(''); onChange();
            }} className="text-xs px-2 rounded bg-primary text-primary-foreground">+</button>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium mb-1">Bonuses (subtracted from time)</h4>
          <ul className="text-sm space-y-1">
            {stage.bonusTypes.map((b) => <li key={b.id} className="flex justify-between"><span>{b.name}</span><span className="font-mono">−{b.seconds}s</span></li>)}
          </ul>
          <div className="flex gap-1 mt-2">
            <input value={bname} onChange={(e) => setBname(e.target.value)} placeholder="Name" className="flex-1 text-xs rounded border px-2 py-1 bg-background" />
            <input value={bsec} onChange={(e) => setBsec(e.target.value)} placeholder="sec" className="w-16 text-xs rounded border px-2 py-1 bg-background" />
            <button onClick={async () => {
              const sec = parseFloat(bsec);
              if (!bname.trim() || !Number.isFinite(sec)) return;
              await matchApi.addStageBonus(stage.id, { name: bname.trim(), seconds: sec });
              setBname(''); setBsec(''); onChange();
            }} className="text-xs px-2 rounded bg-primary text-primary-foreground">+</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ObstaclesSection({ detail, onChange }: { detail: EventDetail; onChange: () => void }) {
  const [name, setName] = useState('');

  async function add() {
    if (!name.trim()) return;
    const seq = (detail.obstacles.at(-1)?.sequence ?? 0) + 1;
    await matchApi.createObstacle(detail.event.id, { name: name.trim(), sequence: seq });
    setName('');
    onChange();
  }

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">Obstacles (apply pen/bon to run time)</h2>
      <div className="space-y-3">
        {detail.obstacles.map((o) => (
          <ObstacleCard key={o.id} obstacle={o} onChange={onChange} />
        ))}
        <div className="rounded border p-3 bg-muted/30 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border px-3 py-2 bg-background" placeholder="New obstacle name (e.g. Wall Climb)" />
          <button onClick={add} className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm">+ Add Obstacle</button>
        </div>
      </div>
    </section>
  );
}

function ObstacleCard({ obstacle, onChange }: { obstacle: EventDetail['obstacles'][number]; onChange: () => void }) {
  const [pname, setPname] = useState('');
  const [psec, setPsec] = useState('');
  const [bname, setBname] = useState('');
  const [bsec, setBsec] = useState('');
  return (
    <div className="rounded border p-4 bg-card">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-medium">Obstacle {obstacle.sequence}: {obstacle.name}</h3>
        <button onClick={async () => { if (confirm('Delete this obstacle?')) { await matchApi.deleteObstacle(obstacle.id); onChange(); } }}
          className="text-red-600 hover:underline text-xs">Delete</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium mb-1">Penalties</h4>
          <ul className="text-sm space-y-1">
            {obstacle.penaltyTypes.map((p) => <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className="font-mono">+{p.seconds}s</span></li>)}
          </ul>
          <div className="flex gap-1 mt-2">
            <input value={pname} onChange={(e) => setPname(e.target.value)} placeholder="Name" className="flex-1 text-xs rounded border px-2 py-1 bg-background" />
            <input value={psec} onChange={(e) => setPsec(e.target.value)} placeholder="sec" className="w-16 text-xs rounded border px-2 py-1 bg-background" />
            <button onClick={async () => {
              const sec = parseFloat(psec);
              if (!pname.trim() || !Number.isFinite(sec)) return;
              await matchApi.addObstaclePenalty(obstacle.id, { name: pname.trim(), seconds: sec });
              setPname(''); setPsec(''); onChange();
            }} className="text-xs px-2 rounded bg-primary text-primary-foreground">+</button>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium mb-1">Bonuses</h4>
          <ul className="text-sm space-y-1">
            {obstacle.bonusTypes.map((b) => <li key={b.id} className="flex justify-between"><span>{b.name}</span><span className="font-mono">−{b.seconds}s</span></li>)}
          </ul>
          <div className="flex gap-1 mt-2">
            <input value={bname} onChange={(e) => setBname(e.target.value)} placeholder="Name" className="flex-1 text-xs rounded border px-2 py-1 bg-background" />
            <input value={bsec} onChange={(e) => setBsec(e.target.value)} placeholder="sec" className="w-16 text-xs rounded border px-2 py-1 bg-background" />
            <button onClick={async () => {
              const sec = parseFloat(bsec);
              if (!bname.trim() || !Number.isFinite(sec)) return;
              await matchApi.addObstacleBonus(obstacle.id, { name: bname.trim(), seconds: sec });
              setBname(''); setBsec(''); onChange();
            }} className="text-xs px-2 rounded bg-primary text-primary-foreground">+</button>
          </div>
        </div>
      </div>
    </div>
  );
}
