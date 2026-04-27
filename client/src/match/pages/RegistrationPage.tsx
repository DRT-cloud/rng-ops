import { useEffect, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { matchApi, type Competitor, type EventDetail } from '../lib/api';
import { downloadCsv, parseCsv, serializeCsv } from '../lib/csv';
import { parseSquaddingHtml, type SquaddingParseResult } from '@/lib/parseSquaddingHtml';

const STATUS_COLORS: Record<Competitor['status'], string> = {
  registered: 'bg-gray-200 text-gray-800',
  checked_in: 'bg-green-100 text-green-800',
  no_show: 'bg-amber-100 text-amber-800',
  dq: 'bg-red-100 text-red-800',
};

export default function RegistrationPage() {
  const [, params] = useRoute<{ id: string }>('/match/registration/:id');
  const eventId = Number(params?.id);

  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [filterDiv, setFilterDiv] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [squadPreview, setSquadPreview] = useState<{ result: SquaddingParseResult; fileName: string } | null>(null);
  const [squadImporting, setSquadImporting] = useState(false);

  // Add form
  const [bib, setBib] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [divisionId, setDivisionId] = useState<number | null>(null);

  async function refresh() {
    const d = await matchApi.getEvent(eventId);
    setDetail(d);
    if (!divisionId && d.divisions[0]) setDivisionId(d.divisions[0].id);
    try {
      const list = await matchApi.listCompetitors(eventId);
      setCompetitors(list);
    } catch {
      setCompetitors([]);
    }
  }

  useEffect(() => { refresh(); }, [eventId]);

  async function add() {
    setError(null);
    if (!bib.trim() || !first.trim() || !last.trim() || !divisionId) {
      setError('All fields required'); return;
    }
    if (!/^\d{1,3}$/.test(bib.trim())) {
      setError('Bib must be 1–3 digits'); return;
    }
    try {
      await matchApi.createCompetitor(eventId, {
        bib: bib.trim(), firstName: first.trim(), lastName: last.trim(), divisionId,
      });
      setBib(''); setFirst(''); setLast('');
      refresh();
    } catch (e: any) { setError(e.message); }
  }

  async function setStatus(c: Competitor, action: 'checkIn' | 'noShow' | 'dq' | 'restore') {
    if (action === 'dq' && !confirm(`Match-level DQ for ${c.first_name} ${c.last_name}? This zeros their entire score.`)) return;
    await matchApi[action](c.id);
    refresh();
  }

  async function remove(c: Competitor) {
    if (!confirm(`Delete ${c.first_name} ${c.last_name} (#${c.bib})?`)) return;
    await matchApi.deleteCompetitor(c.id);
    refresh();
  }

  async function handleSquaddingFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImportMsg(null);
    try {
      const text = await file.text();
      const result = parseSquaddingHtml(text);
      if (result.totals.shooters === 0) {
        setError(`No shooters found in ${file.name}. Make sure this is a PractiScore squadding HTML export.`);
        setSquadPreview(null);
      } else {
        setSquadPreview({ result, fileName: file.name });
      }
    } catch (err: any) {
      setError(`Failed to parse squadding HTML: ${err?.message ?? err}`);
      setSquadPreview(null);
    } finally {
      e.target.value = '';
    }
  }

  async function commitSquaddingImport(replace: boolean) {
    if (!squadPreview) return;
    if (replace && !confirm('Replace ALL existing competitors and squads with this import? This cannot be undone.')) return;
    setSquadImporting(true);
    setError(null);
    setImportMsg(null);
    try {
      const out = await matchApi.importSquadding(eventId, squadPreview.result.bays, replace);
      setImportMsg(
        `Imported ${out.competitors} competitors across ${out.squads} squad slots` +
        (out.divisions > 0 ? ` (auto-created ${out.divisions} division${out.divisions === 1 ? '' : 's'})` : '') + '.',
      );
      setSquadPreview(null);
      await refresh();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSquadImporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(null);
    setError(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { setError('CSV is empty'); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idxBib = header.indexOf('bib');
      const idxFirst = header.indexOf('first') >= 0 ? header.indexOf('first') : header.indexOf('first name');
      const idxLast = header.indexOf('last') >= 0 ? header.indexOf('last') : header.indexOf('last name');
      const idxDiv = header.indexOf('division');
      if (idxBib < 0 || idxFirst < 0 || idxLast < 0 || idxDiv < 0) {
        setError('CSV must have columns: bib, first, last, division');
        return;
      }
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim()));
      const payload = dataRows.map((r) => ({
        bib: r[idxBib]?.trim() ?? '',
        firstName: r[idxFirst]?.trim() ?? '',
        lastName: r[idxLast]?.trim() ?? '',
        divisionCode: r[idxDiv]?.trim() ?? '',
      }));
      const result = await matchApi.importCompetitors(eventId, payload);
      setImportMsg(`Added ${result.added}, skipped ${result.skipped}.${result.errors.length ? ' Errors: ' + result.errors.slice(0, 3).join('; ') : ''}`);
      refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      e.target.value = '';
    }
  }

  function exportCsv() {
    if (!detail) return;
    const divById = new Map(detail.divisions.map((d) => [d.id, d.code]));
    const rows: (string | number)[][] = [
      ['bib', 'first', 'last', 'division', 'status'],
      ...competitors.map((c) => [
        c.bib, c.first_name, c.last_name, divById.get(c.division_id) ?? '', c.status,
      ]),
    ];
    downloadCsv(`${detail.event.name.replace(/\s+/g, '_')}_competitors.csv`, serializeCsv(rows));
  }

  if (!detail) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const divById = new Map(detail.divisions.map((d) => [d.id, d]));
  const filtered = competitors.filter((c) => {
    if (filterDiv !== 'all' && divById.get(c.division_id)?.code !== filterDiv) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${c.bib} ${c.first_name} ${c.last_name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-6xl mx-auto">
      <Link href="/match"><a className="text-sm text-muted-foreground hover:underline">← Match Hub</a></Link>
      <header className="mt-2 mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Registration — {detail.event.name}</h1>
          <p className="text-muted-foreground">{competitors.length} competitors</p>
        </div>
        <div className="space-x-2">
          <label className="px-3 py-2 text-sm rounded border hover:bg-accent cursor-pointer inline-block">
            Import Squadding HTML
            <input type="file" accept=".html,.htm,text/html" onChange={handleSquaddingFile} className="hidden" />
          </label>
          <label className="px-3 py-2 text-sm rounded border hover:bg-accent cursor-pointer inline-block">
            Import CSV
            <input type="file" accept=".csv,text/csv" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={exportCsv} className="px-3 py-2 text-sm rounded border hover:bg-accent">Export CSV</button>
          <Link href={`/match/run/${eventId}`}>
            <a className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground inline-block">Run Start/Finish →</a>
          </Link>
        </div>
      </header>

      {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
      {importMsg && <p className="mb-3 text-green-700 text-sm">{importMsg}</p>}

      {squadPreview && (
        <div className="rounded border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-medium">Squadding preview — {squadPreview.fileName}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {squadPreview.result.totals.bays} bays · {squadPreview.result.totals.shooters} shooters ·{' '}
                {squadPreview.result.totals.emptySlots} empty slots ·{' '}
                {squadPreview.result.totals.divisions.length} division{squadPreview.result.totals.divisions.length === 1 ? '' : 's'}:{' '}
                <span className="font-mono">{squadPreview.result.totals.divisions.join(', ')}</span>
              </p>
              {squadPreview.result.warnings.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-amber-700 dark:text-amber-400">
                    {squadPreview.result.warnings.length} warning{squadPreview.result.warnings.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-1 list-disc ml-5 space-y-0.5">
                    {squadPreview.result.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                    {squadPreview.result.warnings.length > 10 && (
                      <li className="text-muted-foreground">…{squadPreview.result.warnings.length - 10} more</li>
                    )}
                  </ul>
                </details>
              )}
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Show bay breakdown</summary>
                <table className="mt-2 text-xs font-mono">
                  <thead><tr className="text-left"><th className="pr-3">Day</th><th className="pr-3">Bay</th><th className="pr-3">Time</th><th>Shooters</th></tr></thead>
                  <tbody>
                    {squadPreview.result.bays.map((b) => (
                      <tr key={`${b.day}-${b.bay}`}>
                        <td className="pr-3">{b.day}</td>
                        <td className="pr-3">{b.bay}</td>
                        <td className="pr-3">{b.timeStart && b.timeEnd ? `${b.timeStart}–${b.timeEnd}` : '—'}</td>
                        <td>{b.slots.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => commitSquaddingImport(false)}
                disabled={squadImporting}
                className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
              >
                {squadImporting ? 'Importing…' : 'Import (append)'}
              </button>
              <button
                onClick={() => commitSquaddingImport(true)}
                disabled={squadImporting}
                className="px-3 py-2 text-sm rounded border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                Replace all
              </button>
              <button
                onClick={() => setSquadPreview(null)}
                disabled={squadImporting}
                className="px-3 py-2 text-sm rounded border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded border p-4 mb-6 bg-card">
        <h3 className="font-medium mb-3">Add Competitor</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input value={bib} onChange={(e) => setBib(e.target.value)} placeholder="Bib (e.g. 042)" maxLength={3}
            className="rounded border px-3 py-2 bg-background font-mono" />
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First"
            className="rounded border px-3 py-2 bg-background" />
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last"
            className="rounded border px-3 py-2 bg-background" />
          <select value={divisionId ?? ''} onChange={(e) => setDivisionId(Number(e.target.value))}
            className="rounded border px-3 py-2 bg-background">
            {detail.divisions.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
          </select>
          <button onClick={add} className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm">+ Add</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bib or name…"
          className="rounded border px-3 py-2 bg-background flex-1 min-w-48" />
        <select value={filterDiv} onChange={(e) => setFilterDiv(e.target.value)}
          className="rounded border px-3 py-2 bg-background text-sm">
          <option value="all">All divisions</option>
          {detail.divisions.map((d) => <option key={d.id} value={d.code}>{d.code}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border px-3 py-2 bg-background text-sm">
          <option value="all">All status</option>
          <option value="registered">Registered</option>
          <option value="checked_in">Checked in</option>
          <option value="no_show">No show</option>
          <option value="dq">DQ</option>
        </select>
      </div>

      <div className="rounded border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-2 w-16">Bib</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2 w-24">Div</th>
              <th className="text-left p-2 w-32">Status</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No competitors match.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2 font-mono font-medium">{c.bib}</td>
                <td className="p-2">{c.last_name}, {c.first_name}</td>
                <td className="p-2 font-mono">{divById.get(c.division_id)?.code}</td>
                <td className="p-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLORS[c.status]}`}>{c.status.replace('_', ' ')}</span>
                </td>
                <td className="p-2 text-right space-x-2 text-xs">
                  {c.status === 'registered' && <button onClick={() => setStatus(c, 'checkIn')} className="text-green-700 hover:underline">Check In</button>}
                  {c.status === 'checked_in' && <button onClick={() => setStatus(c, 'noShow')} className="text-amber-700 hover:underline">No Show</button>}
                  {(c.status === 'no_show' || c.status === 'dq') && <button onClick={() => setStatus(c, 'restore')} className="text-blue-700 hover:underline">Restore</button>}
                  {c.status !== 'dq' && <button onClick={() => setStatus(c, 'dq')} className="text-red-700 hover:underline">DQ</button>}
                  <button onClick={() => remove(c)} className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-muted-foreground space-y-1">
        <p><strong>Squadding HTML</strong>: PractiScore squadding export (Print → Save as HTML). Auto-creates divisions and assigns sequential 3-digit bibs. Each shooter is also assigned to a day/bay/time slot.</p>
        <p><strong>CSV</strong>: <code>bib,first,last,division</code> (header row required). Division must match a division code defined in setup.</p>
      </div>
    </div>
  );
}
