/**
 * Parse a PractiScore "Squadding" HTML export.
 *
 * The export has a small number of <td>s. Each <td> contains:
 *   <strong>FRIDAY 10:00-11:00 1</strong>          (bay heading) OR
 *   <strong>FRIDAY NV</strong>                     (day section header — skip)
 *   <span class="clearable"><span>1. Reserved</span></span>
 *   <span class="clearable"><span>4. Charlie Hood (Nv 2-Gun)</span></span>
 *
 * Verified against the 2026 Twilight Biathlon export:
 *   11 bays, 109 shooter slots, 4 divisions (2-Gun, Nv 2-Gun, Nv Pcc, Pcc).
 */

export type Day = 'FRIDAY' | 'SATURDAY' | 'SUNDAY' | 'STAFF';

export interface SquaddingSlot {
  slotNumber: number;
  firstName: string;
  lastName: string;
  divisionName: string;
}

export interface SquaddingBay {
  day: Day;
  bay: number;
  timeStart: string | null;
  timeEnd: string | null;
  slots: SquaddingSlot[];
}

export interface SquaddingParseResult {
  bays: SquaddingBay[];
  totals: {
    bays: number;
    shooters: number;
    emptySlots: number;
    divisions: string[];
  };
  warnings: string[];
}

const DAY_RX = /^(FRIDAY|SATURDAY|SUNDAY|STAFF)\b/;
// "FRIDAY 10:00-11:00 1"  OR  "STAFF 12"  OR  "FRIDAY NV" (section header — has no trailing number-as-bay alone)
const BAY_HEADING_RX =
  /^(FRIDAY|SATURDAY|SUNDAY|STAFF)\s+(?:(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+)?(\d+)\s*$/;
// "4. Charlie Hood (Nv 2-Gun)"
const SLOT_RX = /^\s*(\d+)\.\s+(.*?)\s+\(([^)]+)\)\s*$/;
// Empty / placeholder slots: "1. Reserved" or "1. Empty"
const PLACEHOLDER_RX = /^\s*(\d+)\.\s+(Reserved|Empty)\s*$/i;

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.replace(/\s+/g, ' ').trim();
  const idx = trimmed.indexOf(' ');
  if (idx < 0) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

export function parseSquaddingHtml(html: string): SquaddingParseResult {
  const warnings: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const bays: SquaddingBay[] = [];
  let emptySlots = 0;
  const divisions = new Set<string>();

  const tds = Array.from(doc.querySelectorAll('td'));
  for (const td of tds) {
    const strong = td.querySelector('strong');
    if (!strong) continue;
    const headingText = (strong.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!headingText) continue;
    if (!DAY_RX.test(headingText)) continue;

    const m = BAY_HEADING_RX.exec(headingText);
    if (!m) {
      // Not a bay heading — likely a day-section header like "FRIDAY NV" — skip.
      continue;
    }
    const day = m[1] as Day;
    const timeStart = m[2] ?? null;
    const timeEnd = m[3] ?? null;
    const bayNum = parseInt(m[4]!, 10);

    const slots: SquaddingSlot[] = [];
    const innerSpans = td.querySelectorAll('span.clearable > span');
    innerSpans.forEach((sp) => {
      const text = (sp.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (PLACEHOLDER_RX.test(text)) {
        emptySlots++;
        return;
      }
      const sm = SLOT_RX.exec(text);
      if (!sm) {
        warnings.push(`Could not parse slot in bay ${day} ${bayNum}: "${text}"`);
        return;
      }
      const slotNumber = parseInt(sm[1]!, 10);
      const fullName = sm[2]!.trim();
      const divisionName = sm[3]!.trim();
      const { firstName, lastName } = splitName(fullName);
      if (!firstName) {
        warnings.push(`Empty name in bay ${day} ${bayNum} slot ${slotNumber}`);
        return;
      }
      divisions.add(divisionName);
      slots.push({ slotNumber, firstName, lastName, divisionName });
    });

    bays.push({ day, bay: bayNum, timeStart, timeEnd, slots });
  }

  // Sort: day order then bay number
  const dayOrder: Record<Day, number> = { FRIDAY: 0, SATURDAY: 1, SUNDAY: 2, STAFF: 3 };
  bays.sort((a, b) => dayOrder[a.day] - dayOrder[b.day] || a.bay - b.bay);

  const shooters = bays.reduce((acc, b) => acc + b.slots.length, 0);
  return {
    bays,
    totals: {
      bays: bays.length,
      shooters,
      emptySlots,
      divisions: Array.from(divisions).sort(),
    },
    warnings,
  };
}
