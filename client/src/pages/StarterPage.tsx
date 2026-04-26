import { useMemo, useState } from "react";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RunListData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmt12h } from "@/lib/format";

export default function StarterPage() {
  const { data } = useQuery<RunListData>({ queryKey: ["/api/runlist"], refetchInterval: 2000 });
  const [runnerNumInputs, setRunnerNumInputs] = useState<Record<number, string>>({});

  const queue = useMemo(() => {
    if (!data) return [] as any[];
    const entriesMap = new Map(data.entries.map(e => [e.id, e]));
    const timingMap = new Map(data.timings.map(t => [t.entryId, t]));
    const attendMap = new Map(data.attendance.map(a => [a.entryId, a]));
    const squadsMap = new Map(data.squads.map(s => [s.id, s]));
    return data.slots
      .filter(s => s.activeEntryId && s.scheduledStart)
      .map(s => ({
        slot: s,
        entry: entriesMap.get(s.activeEntryId!)!,
        timing: timingMap.get(s.activeEntryId!),
        attend: attendMap.get(s.activeEntryId!),
        squad: squadsMap.get(s.squadId),
      }))
      .filter(r => {
        const status = r.timing?.raceStatus ?? "Scheduled";
        const arr = r.attend?.arrivalStatus ?? "Not Checked In";
        return status === "Scheduled" && arr !== "No Show" && arr !== "Withdrawn";
      })
      .sort((a, b) => (a.slot.scheduledStart ?? "").localeCompare(b.slot.scheduledStart ?? ""));
  }, [data]);

  if (!data?.event) return (
    <AppLayout><PageHeader title="Starter" /><PageBody><p className="text-muted-foreground">No event loaded.</p></PageBody></AppLayout>
  );

  // Next available runner number = max + 1
  const nextRunnerNumber = (data.entries.reduce((m, e) => Math.max(m, e.runnerNumber ?? 0), 0) || 0) + 1;

  async function startRunner(entryId: number, suggestedRN: number) {
    const inputVal = runnerNumInputs[entryId];
    const rn = inputVal ? parseInt(inputVal) : suggestedRN;
    await apiRequest("POST", `/api/start/${entryId}`, { actualStart: new Date().toISOString(), runnerNumber: rn });
    await queryClient.invalidateQueries();
  }

  const current = queue[0];
  const onDeck = queue[1];
  const upcoming = queue.slice(2, 7);

  return (
    <AppLayout>
      <PageHeader
        title="Starter"
        subtitle={`${queue.length} runners in queue`}
      />
      <PageBody>
        {!current ? (
          <p className="text-muted-foreground">No runners queued.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current runner */}
            <Card className="lg:col-span-2 border-primary/40 shadow-md" data-testid="card-current-runner">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="uppercase tracking-wide">Current</Badge>
                  <span className="text-sm text-muted-foreground">Sched {fmt12h(current.slot.scheduledStart)}</span>
                </div>
                <CardTitle className="text-2xl mt-2">{current.entry.displayName}</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {current.entry.divisionNormalized} · {current.squad?.label} · Slot #{current.slot.position}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium uppercase text-muted-foreground mb-1 block">Runner number</label>
                    <Input
                      type="number"
                      placeholder={String(nextRunnerNumber)}
                      value={runnerNumInputs[current.entry.id] ?? ""}
                      onChange={e => setRunnerNumInputs(prev => ({ ...prev, [current.entry.id]: e.target.value }))}
                      className="text-2xl h-14 font-mono max-w-[180px]"
                      data-testid="input-runner-number"
                    />
                  </div>
                  <Button
                    size="lg"
                    className="h-14 text-lg px-10"
                    onClick={() => startRunner(current.entry.id, nextRunnerNumber)}
                    data-testid="button-start-now"
                  >
                    Start now
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* On deck */}
            <Card>
              <CardHeader>
                <Badge variant="secondary" className="uppercase w-fit">On deck</Badge>
                {onDeck ? (
                  <>
                    <CardTitle className="text-lg mt-2">{onDeck.entry.displayName}</CardTitle>
                    <div className="text-xs text-muted-foreground">{onDeck.entry.divisionNormalized} · Sched {fmt12h(onDeck.slot.scheduledStart)}</div>
                  </>
                ) : (
                  <CardTitle className="text-base mt-2 text-muted-foreground italic">—</CardTitle>
                )}
              </CardHeader>
            </Card>

            {/* Upcoming */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Upcoming runners</CardTitle>
              </CardHeader>
              <CardContent>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No additional runners queued.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {upcoming.map(r => (
                        <tr key={r.entry.id} className="border-t border-border/40">
                          <td className="py-1.5 text-xs text-muted-foreground w-20">{fmt12h(r.slot.scheduledStart)}</td>
                          <td className="py-1.5 font-medium">{r.entry.displayName}</td>
                          <td className="py-1.5 text-xs text-muted-foreground">{r.entry.divisionNormalized}</td>
                          <td className="py-1.5 text-xs text-muted-foreground">{r.squad?.label} · #{r.slot.position}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
    </AppLayout>
  );
}
