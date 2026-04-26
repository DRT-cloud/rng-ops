import { useMemo } from "react";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RunListData } from "@/lib/api";
import { penaltySecondsForEntry, officialSeconds } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmt12hSec, fmtSeconds, rawSeconds } from "@/lib/format";
import { PenaltyPanel } from "@/components/PenaltyPanel";

export default function FinishPage() {
  const { data } = useQuery<RunListData>({ queryKey: ["/api/runlist"], refetchInterval: 1000 });

  const onCourse = useMemo(() => {
    if (!data) return [] as { timing: any; entry: any }[];
    const entriesMap = new Map(data.entries.map(e => [e.id, e]));
    return data.timings
      .filter(t => t.actualStart && !t.finish)
      .map(t => ({ timing: t, entry: entriesMap.get(t.entryId)! }))
      .sort((a, b) => (a.timing.actualStart ?? "").localeCompare(b.timing.actualStart ?? ""));
  }, [data]);

  if (!data?.event) return (
    <AppLayout><PageHeader title="Finish" /><PageBody><p className="text-muted-foreground">No event loaded.</p></PageBody></AppLayout>
  );

  // Live tick every second
  const now = Date.now();

  async function finishNow(entryId: number) {
    await apiRequest("POST", `/api/finish/${entryId}`, { finish: new Date().toISOString() });
    await queryClient.invalidateQueries();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Finish"
        subtitle={`${onCourse.length} runners on course`}
      />
      <PageBody>
        {onCourse.length === 0 ? (
          <p className="text-muted-foreground">No runners currently on course.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {onCourse.map(r => {
              const elapsed = r.timing.actualStart ? Math.floor((now - new Date(r.timing.actualStart).getTime()) / 1000) : 0;
              return (
                <Card key={r.entry.id} data-testid={`card-on-course-${r.entry.id}`} className="border-primary/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">#{r.entry.runnerNumber ?? "—"} {r.entry.displayName}</CardTitle>
                        <div className="text-xs text-muted-foreground">{r.entry.divisionNormalized} · started {fmt12hSec(r.timing.actualStart)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-2xl font-semibold" data-testid={`text-elapsed-${r.entry.id}`}>{fmtSeconds(elapsed)}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">elapsed</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button size="lg" className="w-full" onClick={() => finishNow(r.entry.id)} data-testid={`button-finish-${r.entry.id}`}>
                      Finish now ({new Date().toLocaleTimeString("en-US", { hour12: true, hour: "numeric", minute: "2-digit", second: "2-digit" })})
                    </Button>
                    <div className="mt-3">
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">Apply penalty</div>
                      <PenaltyPanel entryId={r.entry.id} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>
    </AppLayout>
  );
}
