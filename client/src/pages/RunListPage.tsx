import { useMemo, useState } from "react";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RunListData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt12h } from "@/lib/format";
import { Minus, Move } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { utils, writeFile } from "xlsx";

export default function RunListPage() {
  const { data } = useQuery<RunListData>({ queryKey: ["/api/runlist"] });
  const [pickerForSlot, setPickerForSlot] = useState<number | null>(null);
  const { toast } = useToast();

  const slotsBySquad = useMemo(() => {
    const m = new Map<number, any[]>();
    if (!data) return m;
    for (const s of data.slots) {
      const arr = m.get(s.squadId) ?? [];
      arr.push(s);
      m.set(s.squadId, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.position - b.position);
    return m;
  }, [data]);

  const entriesMap = useMemo(() => new Map((data?.entries ?? []).map(e => [e.id, e])), [data]);
  const timingMap = useMemo(() => new Map((data?.timings ?? []).map(t => [t.entryId, t])), [data]);

  if (!data?.event) return (
    <AppLayout>
      <PageHeader title="Run List" />
      <PageBody>
        <p className="text-muted-foreground">No event loaded. Start on the Import / Setup page.</p>
      </PageBody>
    </AppLayout>
  );

  const squads = data.squads;

  // "Open slot" = active entry is null and slot type is open or competitor but unmatched/unassigned
  const openSlots = data.slots.filter(s => s.activeEntryId == null);

  async function compress() {
    if (!confirm("Compress schedule? This reflows open slots for future runners only. Started/finished runners are untouched.")) return;
    const r = await apiRequest("POST", "/api/compress", {});
    const j = await r.json();
    toast({ title: "Schedule compressed", description: `${j.moved} slot updates.` });
    await queryClient.invalidateQueries({ queryKey: ["/api/runlist"] });
  }

  async function assignSlot(slotId: number, entryId: number | null) {
    await apiRequest("POST", `/api/slot/${slotId}/assign`, { entryId });
    await queryClient.invalidateQueries();
    setPickerForSlot(null);
  }

  async function clearSlot(slotId: number) {
    await apiRequest("POST", `/api/slot/${slotId}/assign`, { entryId: null });
    await queryClient.invalidateQueries();
  }

  // Unassigned entries eligible for a picker
  const assignedEntryIds = new Set(data.slots.map(s => s.activeEntryId).filter((x): x is number => x != null));
  const unassignedEntries = data.entries.filter(e => !assignedEntryIds.has(e.id));

  function exportRunList() {
    const rows: any[] = [];
    for (const sq of squads) {
      const slots = slotsBySquad.get(sq.id) ?? [];
      for (const s of slots) {
        const e = s.activeEntryId ? entriesMap.get(s.activeEntryId) : null;
        const t = s.activeEntryId ? timingMap.get(s.activeEntryId) : null;
        const a = s.activeEntryId ? data!.attendance.find(x => x.entryId === s.activeEntryId) : null;
        rows.push({
          "Squad": sq.label,
          "Slot": s.position,
          "Scheduled Start": fmt12h(s.scheduledStart),
          "Competitor": e?.displayName ?? (s.slotType === "open" ? "(open)" : s.rawLabel),
          "Division": e?.divisionNormalized ?? "",
          "Arrival": a?.arrivalStatus ?? "",
          "Race Status": t?.raceStatus ?? "",
          "Actual Start": fmt12h(t?.actualStart),
          "Finish": fmt12h(t?.finish),
        });
      }
    }
    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Run List");
    writeFile(wb, `runlist-${data!.event.name.replace(/\W+/g, "_")}.xlsx`);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Run List"
        subtitle={`${data.squads.length} squads · ${data.slots.length} slots · ${openSlots.length} open · original schedule preserved`}
        actions={
          <>
            <Button variant="outline" onClick={exportRunList} data-testid="button-export-runlist">Export XLSX</Button>
            <Button variant="outline" onClick={compress} data-testid="button-compress">Auto-compress open slots</Button>
          </>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {squads.map(sq => {
            const slots = slotsBySquad.get(sq.id) ?? [];
            return (
              <Card key={sq.id} data-testid={`card-squad-${sq.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{sq.label}</span>
                    <Badge variant={sq.type === "staff" ? "outline" : "secondary"} className="text-xs">
                      {sq.type === "staff" ? "Staff" : `${sq.intervalMinutes}m intervals`}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <table className="w-full text-xs">
                    <tbody>
                      {slots.map(slot => {
                        const e = slot.activeEntryId ? entriesMap.get(slot.activeEntryId) : null;
                        const ambiguous = slot.matchStatus === "ambiguous";
                        const unmatched = slot.matchStatus === "unmatched" && slot.slotType !== "open";
                        return (
                          <tr key={slot.id} className="border-b border-border/40 last:border-0" data-testid={`row-slot-${slot.id}`}>
                            <td className="py-1.5 text-muted-foreground w-8">{slot.position}.</td>
                            <td className="py-1.5 w-20 text-muted-foreground">{fmt12h(slot.scheduledStart)}</td>
                            <td className="py-1.5">
                              {e ? (
                                <span>
                                  <span className="font-medium">{e.displayName}</span>
                                  {e.divisionNormalized && <span className="text-muted-foreground ml-1.5 text-[11px]">{e.divisionNormalized}</span>}
                                </span>
                              ) : slot.slotType === "open" || !slot.activeEntryId ? (
                                <span className="text-muted-foreground italic">{slot.rawLabel === "Reserved" ? "Reserved (open)" : slot.rawLabel === "Empty" ? "Open" : "Open"}</span>
                              ) : (
                                <span className="italic">{slot.rawLabel}</span>
                              )}
                              {ambiguous && <Badge variant="destructive" className="ml-2 text-[10px]">ambiguous</Badge>}
                              {unmatched && <Badge variant="destructive" className="ml-2 text-[10px]">unmatched</Badge>}
                            </td>
                            <td className="py-1.5 w-16 text-right">
                              {slot.activeEntryId ? (
                                <button
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => clearSlot(slot.id)}
                                  title="Clear slot"
                                  data-testid={`button-clear-slot-${slot.id}`}
                                >
                                  <Minus className="w-3.5 h-3.5 inline" />
                                </button>
                              ) : (
                                <button
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => setPickerForSlot(slot.id)}
                                  title="Assign runner"
                                  data-testid={`button-assign-slot-${slot.id}`}
                                >
                                  <Move className="w-3.5 h-3.5 inline" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {pickerForSlot != null && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setPickerForSlot(null)}>
            <Card className="max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <CardHeader><CardTitle className="text-base">Assign runner to slot</CardTitle></CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {unassignedEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All registered entries are already assigned to slots.</p>
                ) : (
                  <ul className="space-y-1">
                    {unassignedEntries.map(e => (
                      <li key={e.id}>
                        <button
                          onClick={() => assignSlot(pickerForSlot, e.id)}
                          className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center justify-between"
                          data-testid={`button-pick-entry-${e.id}`}
                        >
                          <span>{e.displayName}</span>
                          <span className="text-xs text-muted-foreground">{e.divisionNormalized}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
    </AppLayout>
  );
}
