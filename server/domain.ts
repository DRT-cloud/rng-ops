// Domain logic: normalization, matching, scheduling, scoring.
// No DB/IO calls — pure functions so they can be unit-tested.

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Normalize a division label to a canonical form, case/spacing/ordering-robust.
// Canonical examples: "2-Gun", "PCC", "NV 2-Gun", "NV PCC".
// The canonical list is event-defined; this function prepares a "lookup key".
export function normalizeDivisionKey(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = stripDiacritics(raw);
  s = s.toLowerCase();
  s = s.replace(/[._]/g, " ");
  s = collapseSpaces(s);
  // Normalize "nv" prefix token
  s = s.replace(/^night\s*vision\b/g, "nv");
  s = s.replace(/\bnv\b/g, "nv");
  // Normalize 2-Gun variations
  s = s.replace(/\b2\s*gun\b/g, "2-gun");
  s = s.replace(/\b2g\b/g, "2-gun");
  s = s.replace(/\btwo[-\s]gun\b/g, "2-gun");
  // Normalize pcc
  s = s.replace(/\bpcc\b/g, "pcc");
  return collapseSpaces(s);
}

// Format the canonical division string given a key. Uses event's canonical list first.
export function canonicalDivision(raw: string | null | undefined, canonicalList: string[]): string | null {
  const key = normalizeDivisionKey(raw);
  if (!key) return null;
  for (const c of canonicalList) {
    if (normalizeDivisionKey(c) === key) return c;
  }
  // Fallback: title-case tokens, capitalize NV and PCC specially.
  const parts = key.split(" ").map(t => {
    if (t === "nv") return "NV";
    if (t === "pcc") return "PCC";
    if (t === "2-gun") return "2-Gun";
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  return parts.join(" ");
}

// Known event-day suffixes that can appear in squad names or last-name fields.
// We strip them for person-level matching, but keep them for display.
const NAME_SUFFIX_TOKENS = [
  "friday", "fri",
  "saturday", "sat",
  "sunday", "sun",
  "night", "nv", "nightvision",
  "day", "daylight", "wht", "white", "light",
  "sat 2g", "fri nv", "sat nv", "sun 2g",
  "2g", "2 g",
];

export function normalizeNameForPerson(first: string, last: string): string {
  let s = `${first} ${last}`.toLowerCase();
  s = stripDiacritics(s);
  s = s.replace(/[.,'`]/g, "");
  s = collapseSpaces(s);
  // Strip known trailing suffix tokens (aggressive loop)
  const tokens = s.split(" ");
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (NAME_SUFFIX_TOKENS.includes(last) || /^\d+$/.test(last)) {
      tokens.pop();
    } else {
      break;
    }
  }
  // Also strip suffix bigrams like "fri nv", "sat 2g"
  let changed = true;
  while (changed && tokens.length >= 2) {
    const bigram = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
    if (NAME_SUFFIX_TOKENS.includes(bigram)) {
      tokens.pop();
      tokens.pop();
    } else {
      changed = false;
    }
  }
  return tokens.join(" ");
}

// Exact entry key: normalized name + normalized division.
// Used to match squad-slot competitor strings to registration rows.
export function entryKey(first: string, last: string, division: string): string {
  return `${normalizeNameForPerson(first, last)}|${normalizeDivisionKey(division)}`;
}

// Parse a slot line like "John Stoner Fri Nv (Nv 2-Gun)" into {name, division}.
export function parseSlotName(raw: string): { name: string; division: string | null } {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), division: m[2].trim() };
  return { name: raw.trim(), division: null };
}

// Split "John Stoner Fri Nv" into { first: "John", last: "Stoner Fri Nv" }.
// PractiScore CSVs put everything after the first token into the last-name field frequently,
// so we use the same convention: first = first token, last = the rest.
export function splitSlotName(full: string): { first: string; last: string } {
  const tokens = full.trim().split(/\s+/);
  if (tokens.length === 1) return { first: tokens[0], last: "" };
  return { first: tokens[0], last: tokens.slice(1).join(" ") };
}

// --- Squad PDF parsing ---
export type ParsedSquad = {
  label: string;
  squadNumber: string | null;
  type: "timed" | "staff";
  dayLabel: string | null;
  timeWindow: { startHour: number; endHour: number } | null; // 0-23
  slots: Array<{ position: number; rawLabel: string }>;
  sortOrder: number;
};

// Parse PDF-extracted text into squad blocks. Accepts an array of page-texts OR a single big string.
export function parseSquadText(text: string): ParsedSquad[] {
  // Normalize line endings and split into lines, strip page-title lines like "FRIDAY NV", "STAFF", "SATURDAY"
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const squadHeader = /^(FRIDAY|SATURDAY|SUNDAY|STAFF)\s+(.*?)\s*$/i;
  const timedHeader = /^(FRIDAY|SATURDAY|SUNDAY)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(\d+)\s*$/i;
  const staffHeader = /^STAFF\s+(\d+)\s*$/i;
  const slotLine = /^(\d+)\.\s*(.+?)\s*$/;

  type Block = ParsedSquad;
  const blocks: Block[] = [];
  let current: Block | null = null;
  let order = 0;

  for (const line of lines) {
    const mTimed = line.match(timedHeader);
    const mStaff = line.match(staffHeader);
    if (mTimed) {
      const [, day, startStr, endStr, num] = mTimed;
      const startHour = parseTimeTo24(startStr, day.toUpperCase());
      const endHour = parseTimeTo24(endStr, day.toUpperCase(), startHour);
      current = {
        label: line,
        squadNumber: num,
        type: "timed",
        dayLabel: titleDay(day),
        timeWindow: { startHour, endHour },
        slots: [],
        sortOrder: order++,
      };
      blocks.push(current);
      continue;
    }
    if (mStaff) {
      const [, num] = mStaff;
      current = {
        label: line,
        squadNumber: num,
        type: "staff",
        dayLabel: null,
        timeWindow: null,
        slots: [],
        sortOrder: order++,
      };
      blocks.push(current);
      continue;
    }
    // Skip section-label lines like "FRIDAY NV", "SATURDAY", "STAFF" with no number
    if (/^(FRIDAY|SATURDAY|SUNDAY|STAFF)(\s+\w+)*$/i.test(line) && !line.match(/\d/)) continue;

    const mSlot = line.match(slotLine);
    if (mSlot && current) {
      const [, pos, rest] = mSlot;
      current.slots.push({ position: parseInt(pos, 10), rawLabel: rest.trim() });
    }
  }
  return blocks;
}

// Biathlon squad hours like 10:00-11:00 use a mix of AM (daytime) and afternoon times.
// Context:
// - Hours 10:00, 11:00 are AM.
// - Hours 12:00 is noon (PM).
// - Hours 1:00..9:00 after a noon block are PM.
// We'll interpret based on sequence: once we've seen 12:00 in a day, subsequent low hours are PM.
// But since parsing is line-by-line without sequence state across squads, use this rule:
// - 10:00, 11:00 -> 10, 11 (AM)
// - 12:00 -> 12 (noon)
// - 1:00..9:00 -> 13..21 (PM) — biathlon context, squads run through the afternoon/evening.
// This matches the sample data (FRIDAY 10:00..FRIDAY 1:00 being 10am..1pm).
function parseTimeTo24(t: string, _day: string, _priorHour?: number): number {
  const [hh] = t.split(":");
  const h = parseInt(hh, 10);
  if (h === 10 || h === 11) return h;   // AM
  if (h === 12) return 12;              // Noon
  if (h >= 1 && h <= 9) return h + 12;  // PM
  return h;
}

function titleDay(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// --- Matching ---
export type RegEntry = {
  id: number;
  firstName: string;
  lastName: string;
  divisionRaw: string | null;
  divisionNormalized: string | null;
  email: string | null;
  phone: string | null;
};

// Returns entryId if single strong match, else list of candidates with scores.
export type MatchResult =
  | { status: "matched"; entryId: number }
  | { status: "ambiguous"; candidates: Array<{ entryId: number; score: number; reason: string }> }
  | { status: "unmatched" };

export function matchSlotToEntry(
  slotName: string,
  slotDivisionRaw: string | null,
  entries: RegEntry[]
): MatchResult {
  const { first: sf, last: sl } = splitSlotName(slotName);
  const slotKey = entryKey(sf, sl, slotDivisionRaw ?? "");
  const slotPersonKey = normalizeNameForPerson(sf, sl);
  const slotDivKey = normalizeDivisionKey(slotDivisionRaw ?? "");

  // Tier 1: exact person-name + division match
  const exact = entries.filter(e =>
    entryKey(e.firstName, e.lastName, e.divisionRaw ?? "") === slotKey
  );
  if (exact.length === 1) return { status: "matched", entryId: exact[0].id };
  if (exact.length > 1) {
    return {
      status: "ambiguous",
      candidates: exact.map(e => ({ entryId: e.id, score: 1.0, reason: "exact name+division" })),
    };
  }

  // Tier 2: person-name match ignoring division
  const nameOnly = entries.filter(e =>
    normalizeNameForPerson(e.firstName, e.lastName) === slotPersonKey
  );

  // If slot has no division info (staff squads, etc.), a single name-only match is a match.
  if (!slotDivKey) {
    if (nameOnly.length === 1) return { status: "matched", entryId: nameOnly[0].id };
    if (nameOnly.length > 1) {
      return {
        status: "ambiguous",
        candidates: nameOnly.map(e => ({ entryId: e.id, score: 0.7, reason: "name only" })),
      };
    }
    return { status: "unmatched" };
  }

  // With division info but no exact match, score by Levenshtein on name + division equality
  const candidates = nameOnly
    .map(e => {
      const divMatch = normalizeDivisionKey(e.divisionRaw ?? "") === slotDivKey ? 0.2 : 0;
      return { entryId: e.id, score: 0.75 + divMatch, reason: "name match, division varies" };
    });

  // Tier 3: fuzzy last-name prefix match within the same division.
  const fuzzy = entries
    .filter(e => normalizeDivisionKey(e.divisionRaw ?? "") === slotDivKey)
    .map(e => {
      const ek = normalizeNameForPerson(e.firstName, e.lastName);
      const d = levenshtein(ek, slotPersonKey);
      const longer = Math.max(ek.length, slotPersonKey.length) || 1;
      const sim = 1 - d / longer;
      return { entryId: e.id, score: sim * 0.6, reason: `fuzzy sim ${sim.toFixed(2)}` };
    })
    .filter(c => c.score >= 0.5 && !candidates.find(x => x.entryId === c.entryId));

  const all = [...candidates, ...fuzzy].sort((a, b) => b.score - a.score);
  if (all.length === 0) return { status: "unmatched" };
  if (all.length === 1 && all[0].score >= 0.8) return { status: "matched", entryId: all[0].entryId };
  if (all[0].score >= 0.9 && (all.length === 1 || all[0].score - all[1].score >= 0.2)) {
    return { status: "matched", entryId: all[0].entryId };
  }
  return { status: "ambiguous", candidates: all.slice(0, 5) };
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[] = Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// --- Scheduling ---
// Given a squad's time window (e.g. 10:00-11:00) and interval, produce N timestamps.
// `dateISO` is the YYYY-MM-DD for this squad.
export function generateScheduledStarts(
  dateISO: string,
  startHour24: number,
  endHour24: number,
  intervalMinutes: number,
  slotCount: number
): string[] {
  const out: string[] = [];
  const baseMinutes = startHour24 * 60;
  const windowMinutes = (endHour24 - startHour24) * 60;
  for (let i = 0; i < slotCount; i++) {
    const offset = i * intervalMinutes;
    // If offset exceeds window, still assign (trust user-configured interval); but cap.
    const m = Math.min(baseMinutes + offset, baseMinutes + windowMinutes);
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    // Build a local-naive ISO string that we'll treat as the event's local time.
    const iso = `${dateISO}T${pad2(hh)}:${pad2(mm)}:00`;
    out.push(iso);
  }
  return out;
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }

// --- Scoring ---
export function rawSeconds(actualStart: string | null, finish: string | null): number | null {
  if (!actualStart || !finish) return null;
  const a = new Date(actualStart).getTime();
  let f = new Date(finish).getTime();
  // Next-day rollover: finish earlier than start by clock means add 24h.
  if (f < a) f += 24 * 3600 * 1000;
  return Math.round((f - a) / 1000);
}

export function officialSeconds(rawSec: number | null, penaltySec: number): number | null {
  if (rawSec == null) return null;
  return rawSec + penaltySec;
}

// Format seconds as "mm:ss" or "h:mm:ss"
export function fmtSeconds(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(ss)}`;
  return `${m}:${pad2(ss)}`;
}

// Format an ISO timestamp like "2026-05-15T22:00:00" as "10:00 PM".
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

// --- Same-person same-day spacing validation ---
export type EntryScheduleLite = { entryId: number; personId: number | null; scheduledStart: string | null };
export type SpacingConflict = {
  personId: number;
  entryA: number;
  entryB: number;
  date: string;
  separationMinutes: number;
  requiredMinutes: number;
};

export function detectSpacingConflicts(list: EntryScheduleLite[], requiredMinutes = 90): SpacingConflict[] {
  const conflicts: SpacingConflict[] = [];
  const byPerson = new Map<number, EntryScheduleLite[]>();
  for (const x of list) {
    if (!x.personId || !x.scheduledStart) continue;
    const arr = byPerson.get(x.personId) ?? [];
    arr.push(x);
    byPerson.set(x.personId, arr);
  }
  byPerson.forEach((arr, personId) => {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const da = (a.scheduledStart ?? "").slice(0, 10);
        const db = (b.scheduledStart ?? "").slice(0, 10);
        if (!da || !db || da !== db) continue;
        const ta = new Date(a.scheduledStart!).getTime();
        const tb = new Date(b.scheduledStart!).getTime();
        const sep = Math.abs(ta - tb) / 60000;
        if (sep < requiredMinutes) {
          conflicts.push({
            personId,
            entryA: a.entryId,
            entryB: b.entryId,
            date: da,
            separationMinutes: Math.round(sep),
            requiredMinutes,
          });
        }
      }
    }
  });
  return conflicts;
}
