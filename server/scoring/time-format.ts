/**
 * Time format parsing and formatting for RNG Ops.
 *
 * Single source of truth for all human-readable time strings.
 * The scoring engine works exclusively in decimal seconds; this module
 * is the boundary layer (UI input, CSV import, CSV export, display).
 *
 * Formats supported:
 *   - "MM:SS"        wait time at stages (e.g. "01:30" = 90s)
 *   - "SS.cc"        stage raw time, seconds with hundredths (e.g. "39.57")
 *   - "D:HH:MM:SS"   run start/finish wall-clock timestamp (e.g. "1:08:45:12")
 */

// -----------------------------------------------------------------------------
// MM:SS — wait time
// -----------------------------------------------------------------------------

/**
 * Parse "MM:SS" wait time to seconds.
 * Accepts "1:30", "01:30", "12:05". Rejects invalid forms.
 * Returns NaN for invalid input.
 */
export function parseMmSs(s: string): number {
  if (typeof s !== 'string') return NaN;
  const trimmed = s.trim();
  if (trimmed === '') return NaN;
  const m = /^(\d{1,3}):(\d{1,2})$/.exec(trimmed);
  if (!m) return NaN;
  const mins = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return NaN;
  if (secs >= 60) return NaN;
  if (mins < 0 || secs < 0) return NaN;
  return mins * 60 + secs;
}

/** Format seconds as "MM:SS" (zero-padded minutes, zero-padded seconds). */
export function formatMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------
// SS.cc — stage raw time (seconds with hundredths)
// -----------------------------------------------------------------------------

/**
 * Parse "SS.cc" stage time (e.g. "39.57") to decimal seconds.
 * Also accepts plain integers ("39"), seconds with any decimal precision ("39.5", "39.57", "39.573").
 * Comma thousand separators are tolerated ("2,769.00" -> 2769).
 * Returns NaN for invalid input.
 */
export function parseSeconds(s: string): number {
  if (typeof s !== 'string') return NaN;
  const trimmed = s.trim().replace(/,/g, '');
  if (trimmed === '' || trimmed === '-') return NaN;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return NaN;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

/** Format seconds as "SS.cc" with two decimals. */
export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0.00';
  return seconds.toFixed(2);
}

/** Format seconds with comma thousand separators ("2,769.00"). Matches sample CSV style. */
export function formatSecondsComma(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0.00';
  return seconds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// -----------------------------------------------------------------------------
// D:HH:MM:SS — wall-clock timestamp
// -----------------------------------------------------------------------------

/**
 * Parse a "D:HH:MM:SS" wall-clock string into seconds-since-day-0.
 * Used for run start/finish stamps where we only need the difference.
 * Examples: "1:08:45:12" (day 1, 08:45:12) -> 1*86400 + 8*3600 + 45*60 + 12.
 */
export function parseDhms(s: string): number {
  if (typeof s !== 'string') return NaN;
  const m = /^(\d+):(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(s.trim());
  if (!m) return NaN;
  const d = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  const mi = parseInt(m[3], 10);
  const se = parseInt(m[4], 10);
  if (h >= 24 || mi >= 60 || se >= 60) return NaN;
  return d * 86400 + h * 3600 + mi * 60 + se;
}

export function formatDhms(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00:00:00';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
