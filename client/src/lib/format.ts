// Time / duration formatting helpers mirrored from server/domain.ts for UI use.

export function pad2(n: number): string { return String(n).padStart(2, "0"); }

export function fmt12h(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${pad2(m)} ${ampm}`;
}

export function fmt12hSec(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${pad2(m)}:${pad2(s)} ${ampm}`;
}

export function fmtSeconds(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(ss)}`;
  return `${m}:${pad2(ss)}`;
}

export function rawSeconds(actualStart: string | null | undefined, finish: string | null | undefined): number | null {
  if (!actualStart || !finish) return null;
  const a = new Date(actualStart).getTime();
  let f = new Date(finish).getTime();
  if (f < a) f += 24 * 3600 * 1000;
  return Math.round((f - a) / 1000);
}

// Convert an "HH:MM" or "H:MM" string entered by operator + a date to a full ISO timestamp.
// Accepts 12h with AM/PM suffix OR 24h.
export function parseTimeOnDate(timeStr: string, isoDateOrRef: string | null): string | null {
  const s = timeStr.trim();
  if (!s) return null;
  const refDate = isoDateOrRef ? isoDateOrRef.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const m12 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|AM|PM)?$/);
  if (!m12) return null;
  let h = parseInt(m12[1], 10);
  const m = parseInt(m12[2], 10);
  const sec = m12[3] ? parseInt(m12[3], 10) : 0;
  const ampm = m12[4]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || m > 59 || sec > 59) return null;
  return `${refDate}T${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

export function todayDateOnlyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
