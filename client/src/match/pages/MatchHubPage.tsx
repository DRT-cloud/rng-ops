import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { matchApi, type MatchEvent, type EventDetail } from '../lib/api';

export default function MatchHubPage() {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [active, setActive] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [evs, act] = await Promise.all([matchApi.listEvents(), matchApi.getActive()]);
      setEvents(evs);
      setActive(act);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function activate(id: number) {
    await matchApi.activateEvent(id);
    await refresh();
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">RNG Ops — Match Console</h1>
        <p className="text-muted-foreground">Multi-stage shooting / obstacle race scoring</p>
      </header>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Active Event</h2>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : active ? (
          <div className="rounded-lg border p-4 bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <h3 className="text-lg font-medium">{active.event.name}</h3>
                <p className="text-sm text-muted-foreground">{active.event.event_date}</p>
              </div>
              <div className="text-sm text-muted-foreground">
                {active.divisions.length} divisions · {active.stages.length} stages · {active.obstacles.length} obstacles
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
              <Link href={`/match/setup/${active.event.id}`}>
                <a className="block rounded border p-3 hover:bg-accent text-center text-sm font-medium">Event Setup</a>
              </Link>
              <Link href={`/match/registration/${active.event.id}`}>
                <a className="block rounded border p-3 hover:bg-accent text-center text-sm font-medium">Registration</a>
              </Link>
              <Link href={`/match/run/${active.event.id}`}>
                <a className="block rounded border p-3 hover:bg-accent text-center text-sm font-medium">Run Start/Finish</a>
              </Link>
              {active.stages.map((s) => (
                <Link key={s.id} href={`/match/stage/${s.id}`}>
                  <a className="block rounded border p-3 hover:bg-accent text-center text-sm font-medium">Stage {s.sequence}: {s.name}</a>
                </Link>
              ))}
              {active.obstacles.map((o) => (
                <Link key={o.id} href={`/match/obstacle/${o.id}`}>
                  <a className="block rounded border p-3 hover:bg-accent text-center text-sm font-medium">Obstacle {o.sequence}: {o.name}</a>
                </Link>
              ))}
              <Link href={`/match/results/${active.event.id}`}>
                <a className="block rounded border p-3 bg-primary text-primary-foreground text-center text-sm font-medium">Results</a>
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">No active event. Create one below.</p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">All Events</h2>
          <Link href="/match/setup/new">
            <a className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm font-medium">+ New Event</a>
          </Link>
        </div>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Active</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground">No events yet.</td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2 font-medium">{e.name}</td>
                  <td className="p-2 text-muted-foreground">{e.event_date}</td>
                  <td className="p-2">{e.is_active ? <span className="text-green-600">●</span> : ''}</td>
                  <td className="p-2 text-right space-x-2">
                    <Link href={`/match/setup/${e.id}`}>
                      <a className="text-primary hover:underline">Setup</a>
                    </Link>
                    {!e.is_active && (
                      <button onClick={() => activate(e.id)} className="text-primary hover:underline">
                        Activate
                      </button>
                    )}
                    <Link href={`/match/results/${e.id}`}>
                      <a className="text-primary hover:underline">Results</a>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
