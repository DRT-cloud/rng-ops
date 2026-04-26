import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RunListData } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, UserX, Clock, Users, HelpCircle } from "lucide-react";

type Exception =
  | { type: "ambiguous_match"; slotId: number; squadLabel: string; rawLabel: string; candidates: Array<{ entryId: number; score: number; reason: string }> }
  | { type: "unmatched_slot"; slotId: number; squadLabel: string; rawLabel: string }
  | { type: "unmatched_entry"; entryId: number; displayName: string; division: string }
  | { type: "finish_without_start"; entryId: number; displayName: string }
  | { type: "invalid_duration"; entryId: number; displayName: string; raw: number }
  | { type: "no_show_in_queue"; slotId: number; entryId: number; displayName: string; squadLabel: string }
  | { type: "spacing_conflict"; personId: number; entryA: number; entryB: number; displayNameA: string; displayNameB: string; separationMinutes: number; requiredMinutes: number; date: string };

export default function ExceptionsPage() {
  const { data: items } = useQuery<{ items: Exception[] }>({ queryKey: ["/api/exceptions"], refetchInterval: 5000 });
  const { data: runlist } = useQuery<RunListData>({ queryKey: ["/api/runlist"] });
  const entriesMap = new Map((runlist?.entries ?? []).map(e => [e.id, e]));

  async function assignMatch(slotId: number, entryId: number | null) {
    await apiRequest("POST", `/api/slot/${slotId}/match`, { entryId });
    await queryClient.invalidateQueries();
  }
  async function clearActive(slotId: number) {
    await apiRequest("POST", `/api/slot/${slotId}/assign`, { entryId: null });
    await queryClient.invalidateQueries();
  }

  const list = items?.items ?? [];
  const groups = {
    ambiguous: list.filter(x => x.type === "ambiguous_match"),
    unmatched: list.filter(x => x.type === "unmatched_slot" || x.type === "unmatched_entry"),
    timing: list.filter(x => x.type === "finish_without_start" || x.type === "invalid_duration"),
    noshow: list.filter(x => x.type === "no_show_in_queue"),
    spacing: list.filter(x => x.type === "spacing_conflict"),
  };

  return (
    <AppLayout>
      <PageHeader
        title="Exceptions & Reconciliation"
        subtitle={list.length === 0 ? "All clear." : `${list.length} item(s) need attention.`}
      />
      <PageBody className="space-y-6 max-w-5xl">
        {list.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No exceptions detected.</CardContent></Card>
        )}

        {groups.ambiguous.length > 0 && (
          <Card data-testid="section-ambiguous">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><HelpCircle className="w-4 h-4" /> Ambiguous matches ({groups.ambiguous.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {groups.ambiguous.map((x: any) => (
                <div key={x.slotId} className="border rounded-md p-3">
                  <div className="text-sm font-medium">{x.rawLabel}</div>
                  <div className="text-xs text-muted-foreground">{x.squadLabel}</div>
                  <div className="mt-2 space-y-1">
                    {x.candidates.map((c: any) => {
                      const e = entriesMap.get(c.entryId);
                      return (
                        <div key={c.entryId} className="flex items-center justify-between bg-muted/30 px-2 py-1.5 rounded text-sm">
                          <div>
                            <span className="font-medium">{e?.displayName}</span>
                            <span className="text-xs text-muted-foreground ml-2">{e?.divisionNormalized}</span>
                            <Badge variant="outline" className="ml-2 text-[10px]">score {c.score.toFixed(2)}</Badge>
                            <span className="text-xs text-muted-foreground ml-2">{c.reason}</span>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => assignMatch(x.slotId, c.entryId)} data-testid={`button-assign-${x.slotId}-${c.entryId}`}>Use this</Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {groups.unmatched.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Unmatched ({groups.unmatched.length})</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {groups.unmatched.map((x: any, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 w-24"><Badge variant="outline">{x.type === "unmatched_slot" ? "Slot" : "Entry"}</Badge></td>
                      <td className="py-1.5">{x.type === "unmatched_slot" ? (<><span className="font-medium">{x.rawLabel}</span> <span className="text-xs text-muted-foreground ml-2">{x.squadLabel}</span></>) : (<><span className="font-medium">{x.displayName}</span> <span className="text-xs text-muted-foreground ml-2">{x.division}</span></>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {groups.spacing.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Same-person spacing conflicts ({groups.spacing.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {groups.spacing.map((x: any, i) => (
                <div key={i} className="border rounded-md p-3 text-sm">
                  <div className="font-medium">{x.displayNameA} &amp; {x.displayNameB}</div>
                  <div className="text-xs text-muted-foreground">
                    {x.date} · separation {x.separationMinutes} min (required {x.requiredMinutes}). Resolve by moving one entry in the Run List to a slot that satisfies the 90-minute rule, or accept as manual override.
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {groups.timing.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Timing anomalies ({groups.timing.length})</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {groups.timing.map((x: any, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 w-40"><Badge variant="destructive">{x.type === "finish_without_start" ? "Finish w/o Start" : "Invalid duration"}</Badge></td>
                      <td className="py-1.5">{x.displayName} {x.raw != null && <span className="text-xs text-muted-foreground ml-2">raw={x.raw}s</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {groups.noshow.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserX className="w-4 h-4" /> No-shows still in active queue ({groups.noshow.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {groups.noshow.map((x: any, i) => (
                <div key={i} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <span className="font-medium">{x.displayName}</span>
                    <span className="text-xs text-muted-foreground ml-2">{x.squadLabel}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => clearActive(x.slotId)}>Remove from queue</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </PageBody>
    </AppLayout>
  );
}
