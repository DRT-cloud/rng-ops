import { useMemo, useState } from "react";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RunListData } from "@/lib/api";
import { penaltySecondsForEntry, officialSeconds } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmt12h, fmt12hSec, fmtSeconds, parseTimeOnDate } from "@/lib/format";
import { PenaltyPanel } from "@/components/PenaltyPanel";

export default function OperationsPage() {
  const { data } = useQuery<RunListData>({ queryKey: ["/api/runlist"], refetchInterval: 3000 });
  const [filter, setFilter] = useState("");
  const [squadFilter, setSquadFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openPenaltyFor, setOpenPenaltyFor] = useState<number | null>(null);
  const [editingTime, setEditingTime] = useState<{ entryId: number; field: "actualStart" | "finish" } | null>(null);
  const [editValue, setEditValue] = useState("");

  const rows = useMemo(() => {
    if (!data) return [] as any[];
    const entriesMap = new Map(data.entries.map(e => [e.id, e]));
    const timingMap = new Map(data.timings.map(t => [t.entryId, t]));
    const attendMap = new Map(data.attendance.map(a => [a.entryId, a]));
    const squadsMap = new Map(data.squads.map(s => [s.id, s]));
    return data.slots
      .filter(s => s.activeEntryId != null)
      .map(s => {
        const e = entriesMap.get(s.activeEntryId!)!;
        const t = timingMap.get(s.activeEntryId!);
        const a = attendMap.get(s.activeEntryId!);
        const sq = squadsMap.get(s.squadId);
        const pen = penaltySecondsForEntry(s.activeEntryId!, data.penalties);
        const official = officialSeconds(t?.rawSeconds ?? null, pen);
        return { slot: s, entry: e, timing: t, attend: a, squad: sq, pen, official };
      })
      .sort((a, b) => (a.slot.scheduledStart ?? "").localeCompare(b.slot.scheduledStart ?? ""));
  }, [data]);

  if (!data?.event) return (
    <AppLayout>
      <PageHeader title="Operations" />
      <PageBody><p className="text-muted-foreground">No event loaded.</p></PageBody>
    </AppLayout>
  );

  const filtered = rows.filter(r => {
    if (squadFilter !== "all" && r.squad?.label !== squadFilter) return false;
    if (statusFilter !== "all") {
      const status = r.timing?.raceStatus ?? "Scheduled";
      if (statusFilter !== status) return false;
    }
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      r.entry.displayName.toLowerCase().includes(q) ||
      (r.entry.divisionNormalized ?? "").toLowerCase().includes(q) ||
      String(r.entry.runnerNumber ?? "").includes(q)
    );
  });

  async function startNow(entryId: number) {
    await apiRequest("POST", `/api/start/${entryId}`, { actualStart: new Date().toISOString() });
    await queryClient.invalidateQueries();
  }
  async function finishNow(entryId: number) {
    await apiRequest("POST", `/api/finish/${entryId}`, { finish: new Date().toISOString() });
    await queryClient.invalidateQueries();
  }
  async function saveEditedTime() {
    if (!editingTime) return;
    const ref = data!.event.startDate;
    const iso = parseTimeOnDate(editValue, ref);
    if (!iso) { alert("Invalid time format. Use HH:MM AM/PM or 24h HH:MM"); return; }
    const body: any = {};
    body[editingTime.field] = iso;
    await apiRequest("POST", `/api/timing/${editingTime.entryId}`, body);
    await queryClient.invalidateQueries();
    setEditingTime(null);
    setEditValue("");
  }

  const allStatuses = ["Scheduled", "On Deck", "Started", "Finished", "DNS", "DNF", "DSQ", "Pending Review"];

  return (
    <AppLayout>
      <PageHeader
        title="Operations Dashboard"
        subtitle={`${rows.length} active runners · updates every 3s`}
      />
      <PageBody>
        <div className="flex gap-3 mb-4 flex-wrap">
          <Input placeholder="Search name, division, runner #…" value={filter} onChange={e => setFilter(e.target.value)} className="max-w-xs" data-testid="input-ops-search" />
          <select value={squadFilter} onChange={e => setSquadFilter(e.target.value)} className="border rounded-md px-3 text-sm bg-background">
            <option value="all">All squads</option>
            {data.squads.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded-md px-3 text-sm bg-background">
            <option value="all">All statuses</option>
            {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2 font-medium">#</th>
                <th className="text-left px-2 py-2 font-medium">Competitor</th>
                <th className="text-left px-2 py-2 font-medium">Division</th>
                <th className="text-left px-2 py-2 font-medium">Squad</th>
                <th className="text-left px-2 py-2 font-medium">Sched</th>
                <th className="text-left px-2 py-2 font-medium">Actual Start</th>
                <th className="text-left px-2 py-2 font-medium">Finish</th>
                <th className="text-left px-2 py-2 font-medium">Raw</th>
                <th className="text-left px-2 py-2 font-medium">Pen</th>
                <th className="text-left px-2 py-2 font-medium">Official</th>
                <th className="text-left px-2 py-2 font-medium">Arrival</th>
                <th className="text-left px-2 py-2 font-medium">Race</th>
                <th className="text-left px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <>
                  <tr key={r.entry.id} className="border-t border-border/50" data-testid={`row-ops-${r.entry.id}`}>
                    <td className="px-2 py-1.5 font-mono text-xs">{r.entry.runnerNumber ?? "—"}</td>
                    <td className="px-2 py-1.5 font-medium">{r.entry.displayName}</td>
                    <td className="px-2 py-1.5 text-muted-foreground text-xs">{r.entry.divisionNormalized}</td>
                    <td className="px-2 py-1.5 text-muted-foreground text-xs">{r.squad?.label} · #{r.slot.position}</td>
                    <td className="px-2 py-1.5 text-xs">{fmt12h(r.slot.scheduledStart)}</td>
                    <td className="px-2 py-1.5 text-xs">
                      {editingTime?.entryId === r.entry.id && editingTime?.field === "actualStart" ? (
                        <div className="flex gap-1">
                          <Input value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEditedTime()} className="h-6 text-xs w-24" autoFocus />
                          <Button size="sm" className="h-6 text-xs" onClick={saveEditedTime}>OK</Button>
                        </div>
                      ) : (
                        <button className="hover:underline" onClick={() => { setEditingTime({ entryId: r.entry.id, field: "actualStart" }); setEditValue(r.timing?.actualStart ? fmt12h(r.timing.actualStart) : ""); }} data-testid={`button-edit-start-${r.entry.id}`}>
                          {fmt12hSec(r.timing?.actualStart)}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {editingTime?.entryId === r.entry.id && editingTime?.field === "finish" ? (
                        <div className="flex gap-1">
                          <Input value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEditedTime()} className="h-6 text-xs w-24" autoFocus />
                          <Button size="sm" className="h-6 text-xs" onClick={saveEditedTime}>OK</Button>
                        </div>
                      ) : (
                        <button className="hover:underline" onClick={() => { setEditingTime({ entryId: r.entry.id, field: "finish" }); setEditValue(r.timing?.finish ? fmt12h(r.timing.finish) : ""); }}>
                          {fmt12hSec(r.timing?.finish)}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">{fmtSeconds(r.timing?.rawSeconds)}</td>
                    <td className="px-2 py-1.5 font-mono text-xs">{r.pen ? `+${fmtSeconds(r.pen)}` : "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-xs font-semibold">{fmtSeconds(r.official)}</td>
                    <td className="px-2 py-1.5 text-xs">
                      <Badge variant={r.attend?.arrivalStatus === "Checked In" ? "default" : "outline"} className="text-[10px]">
                        {r.attend?.arrivalStatus ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      <Badge variant={r.timing?.raceStatus === "Finished" ? "secondary" : r.timing?.raceStatus === "Started" ? "default" : "outline"} className="text-[10px]">
                        {r.timing?.raceStatus ?? "Scheduled"}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        {!r.timing?.actualStart && <Button size="sm" className="h-7 text-xs" onClick={() => startNow(r.entry.id)}>Start</Button>}
                        {r.timing?.actualStart && !r.timing?.finish && <Button size="sm" className="h-7 text-xs" variant="secondary" onClick={() => finishNow(r.entry.id)}>Finish</Button>}
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpenPenaltyFor(openPenaltyFor === r.entry.id ? null : r.entry.id)}>Pen</Button>
                      </div>
                    </td>
                  </tr>
                  {openPenaltyFor === r.entry.id && (
                    <tr className="bg-muted/30 border-t border-border/30">
                      <td colSpan={13} className="px-4 py-3">
                        <PenaltyPanel entryId={r.entry.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-12 text-center text-muted-foreground text-sm">No active runners match filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>
    </AppLayout>
  );
}
