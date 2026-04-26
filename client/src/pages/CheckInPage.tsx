import { useMemo, useState } from "react";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RunListData } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmt12hSec } from "@/lib/format";

const STATUSES = ["Not Checked In", "Checked In", "Late Arrival", "No Show", "Withdrawn"];

export default function CheckInPage() {
  const { data } = useQuery<RunListData>({ queryKey: ["/api/runlist"] });
  const [filter, setFilter] = useState("");
  const [divFilter, setDivFilter] = useState<string>("all");

  const attendanceMap = useMemo(() => new Map((data?.attendance ?? []).map(a => [a.entryId, a])), [data]);
  const squadsMap = useMemo(() => new Map((data?.squads ?? []).map(s => [s.id, s])), [data]);
  const slotByEntry = useMemo(() => {
    const m = new Map<number, any>();
    for (const s of (data?.slots ?? [])) if (s.activeEntryId) m.set(s.activeEntryId, s);
    return m;
  }, [data]);

  if (!data?.event) return (
    <AppLayout>
      <PageHeader title="Check-In" />
      <PageBody><p className="text-muted-foreground">No event loaded.</p></PageBody>
    </AppLayout>
  );

  const divisions = Array.from(new Set(data.entries.map(e => e.divisionNormalized).filter(Boolean))) as string[];

  const filteredEntries = data.entries.filter(e => {
    if (divFilter !== "all" && e.divisionNormalized !== divFilter) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      e.displayName.toLowerCase().includes(q) ||
      (e.divisionNormalized ?? "").toLowerCase().includes(q) ||
      (e.squadRaw ?? "").toLowerCase().includes(q) ||
      (e.email ?? "").toLowerCase().includes(q)
    );
  });

  async function setStatus(entryId: number, status: string) {
    await apiRequest("POST", `/api/checkin/${entryId}`, { arrivalStatus: status });
    await queryClient.invalidateQueries();
  }

  // Stats
  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = data.entries.filter(e => (attendanceMap.get(e.id)?.arrivalStatus ?? "Not Checked In") === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout>
      <PageHeader
        title="Check-In"
        subtitle={`${data.entries.length} entries · ${counts["Checked In"] + counts["Late Arrival"]} arrived · ${counts["No Show"]} no-shows`}
      />
      <PageBody>
        <div className="flex gap-3 mb-4">
          <Input
            placeholder="Search by name, squad, division…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="max-w-sm"
            data-testid="input-search"
          />
          <select
            value={divFilter}
            onChange={e => setDivFilter(e.target.value)}
            className="border rounded-md px-3 text-sm bg-background"
            data-testid="select-division-filter"
          >
            <option value="all">All divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="flex gap-2 ml-auto flex-wrap">
            {STATUSES.map(s => (
              <Badge key={s} variant="outline" className="font-mono">
                {s}: <span className="ml-1 font-semibold">{counts[s]}</span>
              </Badge>
            ))}
          </div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Competitor</th>
                <th className="text-left px-3 py-2 font-medium">Division</th>
                <th className="text-left px-3 py-2 font-medium">Squad / Slot</th>
                <th className="text-left px-3 py-2 font-medium">Checked at</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map(e => {
                const a = attendanceMap.get(e.id);
                const slot = slotByEntry.get(e.id);
                const sq = slot ? squadsMap.get(slot.squadId) : null;
                const status = a?.arrivalStatus ?? "Not Checked In";
                return (
                  <tr key={e.id} className="border-t border-border/50 hover:bg-muted/30" data-testid={`row-entry-${e.id}`}>
                    <td className="px-3 py-2 font-medium">{e.displayName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.divisionNormalized}</td>
                    <td className="px-3 py-2 text-muted-foreground">{sq ? `${sq.label} · #${slot?.position}` : <span className="italic">unassigned</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{a?.checkedInAt ? fmt12hSec(a.checkedInAt) : "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={status === "Checked In" ? "default" : status === "No Show" || status === "Withdrawn" ? "destructive" : status === "Late Arrival" ? "secondary" : "outline"} data-testid={`badge-status-${e.id}`}>
                        {status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {status !== "Checked In" && (
                          <Button size="sm" variant="default" onClick={() => setStatus(e.id, "Checked In")} data-testid={`button-checkin-${e.id}`}>Check In</Button>
                        )}
                        {status !== "Late Arrival" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(e.id, "Late Arrival")}>Late</Button>
                        )}
                        {status !== "No Show" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(e.id, "No Show")}>No Show</Button>
                        )}
                        {status !== "Withdrawn" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(e.id, "Withdrawn")}>Withdraw</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageBody>
    </AppLayout>
  );
}
