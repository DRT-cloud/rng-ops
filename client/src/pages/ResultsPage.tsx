import { useMemo, useState } from "react";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import type { RunListData } from "@/lib/api";
import { penaltySecondsForEntry, officialSeconds } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtSeconds, fmt12hSec } from "@/lib/format";
import { utils, writeFile } from "xlsx";

export default function ResultsPage() {
  const { data } = useQuery<RunListData>({ queryKey: ["/api/runlist"], refetchInterval: 3000 });
  const [divView, setDivView] = useState<string>("overall");

  const rows = useMemo(() => {
    if (!data) return [] as any[];
    return data.timings
      .filter(t => t.actualStart && t.finish && t.rawSeconds != null && t.raceStatus !== "DSQ" && t.raceStatus !== "DNF")
      .map(t => {
        const e = data.entries.find(x => x.id === t.entryId)!;
        const pen = penaltySecondsForEntry(t.entryId, data.penalties);
        return {
          entry: e,
          timing: t,
          pen,
          official: officialSeconds(t.rawSeconds, pen)!,
        };
      })
      .sort((a, b) => a.official - b.official);
  }, [data]);

  if (!data?.event) return (
    <AppLayout><PageHeader title="Results" /><PageBody><p className="text-muted-foreground">No event loaded.</p></PageBody></AppLayout>
  );

  const divisions = Array.from(new Set(data.entries.map(e => e.divisionNormalized).filter(Boolean))) as string[];
  const filtered = divView === "overall" ? rows : rows.filter(r => r.entry.divisionNormalized === divView);

  function exportResults() {
    const out = rows.map((r, i) => ({
      "Rank (overall)": i + 1,
      "Runner #": r.entry.runnerNumber ?? "",
      "Name": r.entry.displayName,
      "Division": r.entry.divisionNormalized ?? "",
      "Actual Start": fmt12hSec(r.timing.actualStart),
      "Finish": fmt12hSec(r.timing.finish),
      "Raw Time": fmtSeconds(r.timing.rawSeconds),
      "Penalty": fmtSeconds(r.pen),
      "Official Time": fmtSeconds(r.official),
      "Race Status": r.timing.raceStatus,
    }));
    const ws = utils.json_to_sheet(out);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Overall");
    // Division sheets
    for (const d of divisions) {
      const dr = rows.filter(r => r.entry.divisionNormalized === d).map((r, i) => ({
        "Rank": i + 1,
        "Runner #": r.entry.runnerNumber ?? "",
        "Name": r.entry.displayName,
        "Official Time": fmtSeconds(r.official),
        "Raw": fmtSeconds(r.timing.rawSeconds),
        "Penalty": fmtSeconds(r.pen),
      }));
      if (dr.length) utils.book_append_sheet(wb, utils.json_to_sheet(dr), d.slice(0, 30));
    }
    writeFile(wb, `results-${data!.event.name.replace(/\W+/g, "_")}.xlsx`);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Results"
        subtitle={`${rows.length} finishers`}
        actions={<Button onClick={exportResults} data-testid="button-export-results">Export XLSX</Button>}
      />
      <PageBody>
        <div className="mb-4 flex gap-2 flex-wrap">
          <Badge variant={divView === "overall" ? "default" : "outline"} className="cursor-pointer" onClick={() => setDivView("overall")} data-testid="badge-view-overall">
            Overall
          </Badge>
          {divisions.map(d => (
            <Badge key={d} variant={divView === d ? "default" : "outline"} className="cursor-pointer" onClick={() => setDivView(d)} data-testid={`badge-view-${d}`}>
              {d}
            </Badge>
          ))}
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-12">#</th>
                <th className="text-left px-3 py-2 font-medium w-16">Run #</th>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Division</th>
                <th className="text-right px-3 py-2 font-medium">Raw</th>
                <th className="text-right px-3 py-2 font-medium">Penalty</th>
                <th className="text-right px-3 py-2 font-medium">Official</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.entry.id} className="border-t border-border/40" data-testid={`row-result-${r.entry.id}`}>
                  <td className="px-3 py-2 font-mono">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.entry.runnerNumber ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{r.entry.displayName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.entry.divisionNormalized}</td>
                  <td className="px-3 py-2 font-mono text-right">{fmtSeconds(r.timing.rawSeconds)}</td>
                  <td className="px-3 py-2 font-mono text-right">{r.pen ? `+${fmtSeconds(r.pen)}` : "—"}</td>
                  <td className="px-3 py-2 font-mono text-right font-semibold">{fmtSeconds(r.official)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">No finishers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>
    </AppLayout>
  );
}
