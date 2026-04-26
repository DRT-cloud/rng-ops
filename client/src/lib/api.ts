import type {
  Event, Entry, Squad, Slot, Attendance, Timing, PenaltyApplication, PenaltyDef, DayDef,
} from "@shared/schema";

export type RunListData = {
  event: Event;
  squads: Squad[];
  slots: Slot[];
  entries: Entry[];
  timings: Timing[];
  attendance: Attendance[];
  penalties: PenaltyApplication[];
};

export function getPenalties(ev: Event | null | undefined): PenaltyDef[] {
  if (!ev) return [];
  try { return JSON.parse(ev.penalties || "[]"); } catch { return []; }
}
export function getDivisions(ev: Event | null | undefined): string[] {
  if (!ev) return [];
  try { return JSON.parse(ev.divisions || "[]"); } catch { return []; }
}
export function getDays(ev: Event | null | undefined): DayDef[] {
  if (!ev) return [];
  try { return JSON.parse(ev.days || "[]"); } catch { return []; }
}

// Derived helpers
export function penaltySecondsForEntry(entryId: number, penalties: PenaltyApplication[]): number {
  return penalties.filter(p => p.entryId === entryId && !p.removed).reduce((s, p) => s + p.seconds, 0);
}

export function officialSeconds(rawSec: number | null, penaltySec: number): number | null {
  if (rawSec == null) return null;
  return rawSec + penaltySec;
}
