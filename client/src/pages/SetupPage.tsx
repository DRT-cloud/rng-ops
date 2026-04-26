import { useState, useMemo, useEffect } from "react";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { Event, PenaltyDef, DayDef } from "@shared/schema";
import Papa from "papaparse";
import { Trash2, Upload, Plus, CheckCircle2, FileText, AlertCircle } from "lucide-react";

// PDF.js via ESM
import * as pdfjs from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const t = await p.getTextContent();
    const lines: string[] = [];
    let currentLine: string[] = [];
    let lastY: number | null = null;
    for (const item of t.items as any[]) {
      const y = item.transform?.[5];
      if (lastY != null && Math.abs(y - lastY) > 2) {
        if (currentLine.length) lines.push(currentLine.join(""));
        currentLine = [];
      }
      currentLine.push(item.str);
      if (item.hasEOL) {
        if (currentLine.length) lines.push(currentLine.join(""));
        currentLine = [];
        lastY = null;
      } else {
        lastY = y;
      }
    }
    if (currentLine.length) lines.push(currentLine.join(""));
    out += lines.join("\n") + "\n";
  }
  return out;
}

const DEFAULT_PENALTY_TEMPLATE: PenaltyDef[] = [
  { code: "missed_target", label: "Missed Target", seconds: 30 },
  { code: "procedural", label: "Procedural", seconds: 10 },
  { code: "safety_warning", label: "Safety Warning", seconds: 60 },
];

export default function SetupPage() {
  const { toast } = useToast();
  const { data: currentEvent } = useQuery<Event | null>({ queryKey: ["/api/event"] });

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [intervalMin, setIntervalMin] = useState(4);
  const [divisionsText, setDivisionsText] = useState("2-Gun\nPCC\nNV 2-Gun\nNV PCC");
  const [days, setDays] = useState<DayDef[]>([]);
  const [penalties, setPenalties] = useState<PenaltyDef[]>(DEFAULT_PENALTY_TEMPLATE);

  const [csvRows, setCsvRows] = useState<Record<string, string>[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [isCommitting, setIsCommitting] = useState(false);

  // Auto-populate form from currently active event so users can see their event state
  useEffect(() => {
    if (!currentEvent) return;
    setName(currentEvent.name);
    setStartDate(currentEvent.startDate);
    setEndDate(currentEvent.endDate);
    setIntervalMin(currentEvent.defaultIntervalMinutes ?? 4);
    try {
      const d: string[] = JSON.parse(currentEvent.divisions || "[]");
      if (Array.isArray(d) && d.length) setDivisionsText(d.join("\n"));
    } catch {}
    try {
      const p: PenaltyDef[] = JSON.parse(currentEvent.penalties || "[]");
      if (Array.isArray(p) && p.length) setPenalties(p);
    } catch {}
    try {
      const dd: DayDef[] = JSON.parse(currentEvent.days || "[]");
      if (Array.isArray(dd) && dd.length) setDays(dd);
    } catch {}
  }, [currentEvent]);

  // derive days from startDate..endDate
  function autoFillDays(s: string, e: string) {
    if (!s || !e) return;
    const out: DayDef[] = [];
    const sd = new Date(s + "T00:00:00");
    const ed = new Date(e + "T00:00:00");
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return;
    const cursor = new Date(sd);
    while (cursor <= ed) {
      const label = cursor.toLocaleDateString("en-US", { weekday: "long" });
      const iso = cursor.toISOString().slice(0, 10);
      out.push({ label, date: iso });
      cursor.setDate(cursor.getDate() + 1);
    }
    setDays(out);
  }

  async function onCsvChange(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors?.length) {
      toast({ title: "CSV parse warning", description: parsed.errors[0].message, variant: "destructive" });
    }
    setCsvRows(parsed.data);
    setCsvFileName(file.name);
  }

  async function onPdfChange(file: File | undefined) {
    if (!file) return;
    try {
      const text = await extractPdfText(file);
      setPdfText(text);
      setPdfFileName(file.name);
    } catch (err: any) {
      toast({ title: "PDF parse failed", description: String(err?.message ?? err), variant: "destructive" });
    }
  }

  const csvSummary = useMemo(() => {
    if (!csvRows) return null;
    const divs: Record<string, number> = {};
    for (const r of csvRows) {
      const d = r["Division"] ?? "";
      divs[d] = (divs[d] ?? 0) + 1;
    }
    return { count: csvRows.length, divisions: divs };
  }, [csvRows]);

  const pdfSummary = useMemo(() => {
    if (!pdfText) return null;
    // Quick structure preview: count squad headers
    const timed = (pdfText.match(/^(FRIDAY|SATURDAY|SUNDAY)\s+\d{1,2}:\d{2}/gim) || []).length;
    const staff = (pdfText.match(/^STAFF\s+\d+/gim) || []).length;
    const slots = (pdfText.match(/^\d+\./gm) || []).length;
    return { timed, staff, slots };
  }, [pdfText]);

  const divisions = divisionsText.split("\n").map(s => s.trim()).filter(Boolean);

  const ready = !!(name && startDate && endDate && csvRows && pdfText && divisions.length && days.length);

  async function commitImport() {
    if (!ready || !csvRows || !pdfText) return;
    setIsCommitting(true);
    try {
      const res = await apiRequest("POST", "/api/import/commit", {
        csvRows, squadText: pdfText,
        event: {
          name, startDate, endDate,
          timezone: "America/Chicago",
          defaultIntervalMinutes: intervalMin,
          divisions,
          penalties,
          days,
        },
      });
      const out = await res.json();
      toast({
        title: "Event imported",
        description: `${out.entriesImported} entries, ${out.squadsImported} squads.`,
      });
      await queryClient.invalidateQueries();
      window.location.hash = "#/runlist";
    } catch (err: any) {
      toast({ title: "Import failed", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setIsCommitting(false);
    }
  }

  async function resetEvent() {
    if (!confirm("This permanently deletes the current event and all its data. Continue?")) return;
    await apiRequest("POST", "/api/event/reset", {});
    await queryClient.invalidateQueries();
    toast({ title: "Event cleared" });
  }

  return (
    <AppLayout>
      <PageHeader
        title="Event Setup & Import"
        subtitle="Create a new event, import the PractiScore registration CSV, and upload the squad PDF."
        actions={currentEvent ? (
          <Button variant="outline" onClick={resetEvent} data-testid="button-reset-event">
            <Trash2 className="w-4 h-4 mr-2" /> Reset event
          </Button>
        ) : null}
      />
      <PageBody className="max-w-5xl">
        {currentEvent && (
          <Alert className="mb-6" data-testid="alert-existing-event">
            <CheckCircle2 className="w-4 h-4" />
            <AlertDescription>
              <span className="font-medium">Active event:</span> {currentEvent.name} ({currentEvent.startDate} → {currentEvent.endDate}).
              Re-importing will replace it.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Event details</CardTitle>
              <CardDescription>Event name, dates, and scheduling defaults.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="event-name">Event name</Label>
                  <Input id="event-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spring Biathlon 2026" data-testid="input-event-name" />
                </div>
                <div>
                  <Label htmlFor="start-date">Start date</Label>
                  <Input id="start-date" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); autoFillDays(e.target.value, endDate); }} data-testid="input-start-date" />
                </div>
                <div>
                  <Label htmlFor="end-date">End date</Label>
                  <Input id="end-date" type="date" value={endDate} onChange={e => { setEndDate(e.target.value); autoFillDays(startDate, e.target.value); }} data-testid="input-end-date" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="interval">Default start interval (min)</Label>
                  <Input id="interval" type="number" min={2} max={10} value={intervalMin} onChange={e => setIntervalMin(parseInt(e.target.value) || 4)} data-testid="input-interval" />
                </div>
                <div className="md:col-span-2">
                  <Label>Event days (auto-derived from dates — edit labels if needed)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {days.map((d, i) => (
                      <div key={i} className="flex items-center gap-1 border rounded px-2 py-1 bg-muted/30 text-xs">
                        <Input value={d.label} onChange={e => setDays(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="h-6 w-24 text-xs" data-testid={`input-day-label-${i}`} />
                        <span className="text-muted-foreground">{d.date}</span>
                      </div>
                    ))}
                    {days.length === 0 && <span className="text-xs text-muted-foreground">Set start/end dates first</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Divisions</CardTitle>
              <CardDescription>Canonical division labels (one per line). Case/spelling variations in imported files will be normalized to these.</CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                value={divisionsText}
                onChange={e => setDivisionsText(e.target.value)}
                className="w-full h-32 border rounded-md p-2 font-mono text-sm bg-background"
                data-testid="textarea-divisions"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Obstacle penalties</CardTitle>
              <CardDescription>Event-defined time penalties. One tap in live ops adds the penalty. Starter template loaded — edit freely.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {penalties.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={p.code} onChange={e => setPenalties(prev => prev.map((x, j) => j === i ? { ...x, code: e.target.value } : x))} placeholder="code" className="w-40 font-mono text-sm" data-testid={`input-penalty-code-${i}`} />
                    <Input value={p.label} onChange={e => setPenalties(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="label" className="flex-1" data-testid={`input-penalty-label-${i}`} />
                    <Input type="number" value={p.seconds} onChange={e => setPenalties(prev => prev.map((x, j) => j === i ? { ...x, seconds: parseInt(e.target.value) || 0 } : x))} placeholder="seconds" className="w-28" data-testid={`input-penalty-seconds-${i}`} />
                    <Button variant="ghost" size="sm" onClick={() => setPenalties(prev => prev.filter((_, j) => j !== i))} data-testid={`button-remove-penalty-${i}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setPenalties(prev => [...prev, { code: "", label: "", seconds: 0 }])} data-testid="button-add-penalty">
                  <Plus className="w-4 h-4 mr-1" /> Add penalty
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Registration CSV (PractiScore export)</CardTitle>
              <CardDescription>First row must be headers. Required columns: First Name, Last Name, Division. Squad and contact fields recommended.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted text-sm" data-testid="label-csv-upload">
                  <Upload className="w-4 h-4" />
                  <span>{csvFileName || "Select CSV file"}</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => onCsvChange(e.target.files?.[0])} />
                </label>
                {csvSummary && (
                  <Badge variant="secondary" data-testid="badge-csv-count">
                    {csvSummary.count} rows
                  </Badge>
                )}
              </div>
              {csvSummary && (
                <div className="mt-3 text-xs text-muted-foreground">
                  <span className="font-medium">Divisions seen:</span>{" "}
                  {Object.entries(csvSummary.divisions).map(([d, n]) => (
                    <span key={d} className="inline-block mr-2">
                      {d || "(blank)"} <span className="text-foreground">×{n}</span>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">5. Squad PDF (PractiScore squadding export)</CardTitle>
              <CardDescription>Blocks like "FRIDAY 10:00-11:00 1" or "STAFF 11" with numbered slot lines. Reserved/Empty are preserved as open slots.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted text-sm" data-testid="label-pdf-upload">
                  <FileText className="w-4 h-4" />
                  <span>{pdfFileName || "Select PDF file"}</span>
                  <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => onPdfChange(e.target.files?.[0])} />
                </label>
                {pdfSummary && (
                  <>
                    <Badge variant="secondary" data-testid="badge-pdf-timed">{pdfSummary.timed} timed squads</Badge>
                    <Badge variant="secondary" data-testid="badge-pdf-staff">{pdfSummary.staff} staff squads</Badge>
                    <Badge variant="secondary" data-testid="badge-pdf-slots">{pdfSummary.slots} slot lines</Badge>
                  </>
                )}
              </div>
              {pdfText && (
                <details className="mt-3">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Show extracted text preview</summary>
                  <pre className="text-xs bg-muted/40 p-3 mt-2 rounded max-h-64 overflow-auto font-mono">{pdfText.slice(0, 2000)}{pdfText.length > 2000 ? "\n…" : ""}</pre>
                </details>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {!ready && (
              <div className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-not-ready">
                <AlertCircle className="w-3.5 h-3.5" />
                Complete all 5 sections to import.
              </div>
            )}
            <Button disabled={!ready || isCommitting} onClick={commitImport} size="lg" data-testid="button-commit-import">
              {isCommitting ? "Importing…" : "Import and create event"}
            </Button>
          </div>
        </div>
      </PageBody>
    </AppLayout>
  );
}
