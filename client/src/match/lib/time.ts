/**
 * Time formatting helpers for the match UI.
 *
 * Internal time values are decimal seconds. UI parses MM:SS / SS.cc /
 * D:HH:MM:SS at the boundary.
 */

/** Parse MM:SS into total seconds. Returns null on invalid input. */
export function parseMMSS(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  // MM:SS
  const m = s.match(/^(\d{1,3}):([0-5]\d)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  // pure seconds
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  return null;
}

/** Parse decimal seconds (e.g. "94.32") or MM:SS into seconds. */
export function parseTimeFlexible(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const m = s.match(/^(\d{1,3}):([0-5]\d)(\.\d+)?$/);
  if (m) {
    const minutes = parseInt(m[1], 10);
    const seconds = parseInt(m[2], 10) + parseFloat('0' + (m[3] ?? ''));
    return minutes * 60 + seconds;
  }
  return null;
}

/** Format seconds as MM:SS (no fractional part). */
export function fmtMMSS(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60).toString().padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Format seconds as SS.cc (centiseconds). */
export function fmtSecCs(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  return seconds.toFixed(2);
}

/** Format seconds as MM:SS.cc when over 60s, else SS.cc. */
export function fmtTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return seconds.toFixed(2);
  const mm = Math.floor(seconds / 60);
  const ss = seconds - mm * 60;
  return `${mm}:${ss.toFixed(2).padStart(5, '0')}`;
}
