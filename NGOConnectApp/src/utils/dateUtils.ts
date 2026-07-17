/**
 * Shared date/time formatting utilities for NGO Connect.
 *
 * Standard display format: DD MMM YYYY  |  h:mm AM/PM
 * Examples:
 *   19 Jul 2026
 *   9:30 AM
 *   19 Jul 2026 9:30 AM
 *   19 Jul 2026 – 30 Dec 2026
 *   9:30 AM – 1:00 PM
 *
 * Design notes:
 *   - Date strings are parsed by splitting on 'T' so timezone never shifts the day.
 *     e.g. "2026-07-19T00:00:00" → local Date(2026, 6, 19) regardless of device TZ.
 *   - Time strings ("HH:MM" or "HH:MM:SS") are converted to 12-hour + AM/PM.
 *   - All functions are null-safe — empty string is returned for falsy input.
 */

// ─── Core parsers ─────────────────────────────────────────────────────────────

/**
 * Parse a date string without timezone shift.
 * Handles: "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DDTHH:mm:ssZ"
 */
function parseLocalDate(s: string): Date {
  const datePart = s.split('T')[0]; // always "YYYY-MM-DD"
  const [y, mo, d] = datePart.split('-').map(Number);
  return new Date(y, mo - 1, d);   // local midnight, no UTC shift
}

// ─── Public formatters ────────────────────────────────────────────────────────

/**
 * Format a date string or Date to "DD MMM YYYY".
 * e.g. "2026-07-19T00:00:00" → "19 Jul 2026"
 */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? parseLocalDate(d) : d;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a time string "HH:MM" or "HH:MM:SS" → "h:mm AM/PM".
 * e.g. "09:30:00" → "9:30 AM"
 *      "13:00"    → "1:00 PM"
 */
export function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Combine date + optional time string → "DD MMM YYYY h:mm AM/PM"
 * If timeStr is absent, returns just "DD MMM YYYY".
 */
export function fmtDateTime(
  dateStr: string | null | undefined,
  timeStr?: string | null,
): string {
  const d = fmtDate(dateStr);
  if (!d) return '';
  const t = fmtTime(timeStr);
  return t ? `${d} ${t}` : d;
}

/**
 * Format a date range → "DD MMM YYYY – DD MMM YYYY"
 * If to is absent or same as from, returns just the from date.
 */
export function fmtDateRange(
  from: string | null | undefined,
  to:   string | null | undefined,
): string {
  const f = fmtDate(from);
  if (!f) return '';
  const t = fmtDate(to);
  return t && t !== f ? `${f} – ${t}` : f;
}

/**
 * Format a time range → "h:mm AM/PM – h:mm AM/PM"
 * If end is absent, returns just start.
 */
export function fmtTimeRange(
  start: string | null | undefined,
  end:   string | null | undefined,
): string {
  const s = fmtTime(start);
  if (!s) return '';
  const e = fmtTime(end);
  return e ? `${s} – ${e}` : s;
}
