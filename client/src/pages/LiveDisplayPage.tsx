import { useQuery } from "@tanstack/react-query";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RunListData } from "@/lib/api";
import { fmt12h, fmtSeconds } from "@/lib/format";
import { officialSeconds, penaltySecondsForEntry } from "@/lib/api";
import { useEffect, useState } from "react";

export default function LiveDisplayPage() {
  const { data } = useQuery<RunListData>({
    queryKey: ["/api/runlist"],
    refetchInterval: 3000,
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) {
    return (
      <AppLayout>
        <PageHeader title="Live Display" subtitle="Read-only dashboard" />
        <PageBody>
          <div className="text-muted-foreground" data-testid="text-loading">Loading…</div>
        </PageBody>
      </AppLayout>
    );
  }

  const { slots, entries, timings, attendance } = data;
  const entryById = new Map(entries.map(e => [e.id, e]));
  const timingByEntry = new Map(timings.map(t => [t.entryId, t]));
  const attendanceByEntry = new Map(attendance.map(a => [a.entryId, a]));

  type Row = {
    slotId: number;
    entryId: number;
    entryName: string;
    division: string;
    runnerNumber: number | null;
    scheduled: string;
    actualStart: string | null;
    finish: string | null;
    rawSec: number | null;
    status: string;
  };

  const rows: Row[] = slots
    .filter(s => s.activeEntryId != null && s.scheduledStart != null)
    .map(s => {
      const entry = entryById.get(s.activeEntryId!);
      const t = timingByEntry.get(s.activeEntryId!);
      const a = attendanceByEntry.get(s.activeEntryId!);
      return {
        slotId: s.id,
        entryId: s.activeEntryId!,
        entryName: entry?.displayName ?? "—",
        division: entry?.divisionNormalized ?? "",
        runnerNumber: entry?.runnerNumber ?? null,
        scheduled: s.scheduledStart!,
        actualStart: t?.actualStart ?? null,
        finish: t?.finish ?? null,
        rawSec: t?.rawSeconds ?? null,
        status: a?.arrivalStatus ?? "pending",
      };
    });

  const onCourse = rows.filter(r => r.actualStart != null && r.finish == null);
  const finished = rows
    .filter(r => r.finish != null)
    .sort((a, b) => new Date(b.finish!).getTime() - new Date(a.finish!).getTime())
    .slice(0, 10);
  const upcoming = rows
    .filter(r => r.actualStart == null && r.status !== "No Show" && r.status !== "Withdrawn")
    .sort((a, b) => new Date(a.scheduled).getTime() - new Date(b.scheduled).getTime())
    .slice(0, 10);
  const onDeck = upcoming.slice(0, 3);

  const totalStarted = rows.filter(r => r.actualStart != null).length;
  const totalFinished = rows.filter(r => r.finish != null).length;
  const totalUpcoming = upcoming.length;

  return (
    <AppLayout>
      <PageHeader title="Live Display" subtitle="Read-only dashboard · auto-refresh every 3s" />
      <PageBody>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="On Course" value={onCourse.length} />
          <StatCard label="Finished" value={totalFinished} />
          <StatCard label="Started" value={totalStarted} />
          <StatCard label="Upcoming" value={totalUpcoming} />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <Card data-testid="card-on-course">
            <CardHeader><CardTitle>On Course ({onCourse.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {onCourse.length === 0 ? (
                <div className="text-sm text-muted-foreground">No runners on course</div>
              ) : onCourse.map(r => {
                const elapsed = r.actualStart != null ? Math.floor((now - new Date(r.actualStart).getTime()) / 1000) : 0;
                return (
                  <div key={r.slotId} className="flex items-center justify-between p-3 rounded-md border border-border bg-card" data-testid={`row-oncourse-${r.slotId}`}>
                    <div>
                      <div className="font-semibold">
                        {r.runnerNumber != null && <span className="text-primary mr-2">#{r.runnerNumber}</span>}
                        {r.entryName}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.division}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg">{fmtSeconds(elapsed)}</div>
                      <div className="text-xs text-muted-foreground">started {fmt12h(r.actualStart)}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card data-testid="card-on-deck">
            <CardHeader><CardTitle>On Deck (next 3)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {onDeck.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nothing scheduled</div>
              ) : onDeck.map(r => (
                <div key={r.slotId} className="flex items-center justify-between p-3 rounded-md border border-border bg-card" data-testid={`row-ondeck-${r.slotId}`}>
                  <div>
                    <div className="font-semibold">{r.entryName}</div>
                    <div className="text-xs text-muted-foreground">{r.division}</div>
                  </div>
                  <div className="font-mono text-lg">{fmt12h(r.scheduled)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card data-testid="card-recent-finishes">
            <CardHeader><CardTitle>Recent Finishes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {finished.length === 0 ? (
                <div className="text-sm text-muted-foreground">No finishes yet</div>
              ) : finished.map(r => {
                const penSec = penaltySecondsForEntry(r.entryId, data.penalties);
                const official = officialSeconds(r.rawSec, penSec);
                return (
                  <div key={r.slotId} className="flex items-center justify-between p-3 rounded-md border border-border bg-card" data-testid={`row-finish-${r.slotId}`}>
                    <div>
                      <div className="font-semibold">
                        {r.runnerNumber != null && <span className="text-primary mr-2">#{r.runnerNumber}</span>}
                        {r.entryName}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.division}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg">{official != null ? fmtSeconds(official) : "—"}</div>
                      {penSec > 0 && <Badge variant="secondary" className="text-xs">+{penSec}s pen</Badge>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card data-testid="card-upcoming">
            <CardHeader><CardTitle>Upcoming ({upcoming.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {upcoming.length === 0 ? (
                <div className="text-sm text-muted-foreground">All runners started</div>
              ) : upcoming.map(r => (
                <div key={r.slotId} className="flex items-center justify-between p-3 rounded-md border border-border bg-card" data-testid={`row-upcoming-${r.slotId}`}>
                  <div>
                    <div className="font-medium">{r.entryName}</div>
                    <div className="text-xs text-muted-foreground">{r.division}</div>
                  </div>
                  <div className="font-mono">{fmt12h(r.scheduled)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </AppLayout>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-4xl font-bold mt-1 tabular-nums" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
