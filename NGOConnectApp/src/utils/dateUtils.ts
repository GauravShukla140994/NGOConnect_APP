/**
 * Shared date/time formatting utilities for NGO Connect.
 *
 * Standard display format: DD-Mon-YYYY  |  hh:mm AM/PM
 * Examples:
 *   26-Jul-2026
 *   03:59 AM
 *   26-Jul-2026 02:00 PM
 *   26-Jul-2026 – 30-Dec-2026
 *   09:30 AM – 01:00 PM
 *
 * Design notes:
 *   - Date strings are parsed by splitting on 'T' so timezone never shifts the day.
 *     e.g. "2026-07-19T00:00:00" → local Date(2026, 6, 19) regardless of device TZ.
 *   - Time strings ("HH:MM" or "HH:MM:SS") are converted to 12-hour + AM/PM with
 *     leading zero on the hour (02:00 PM, not 2:00 PM).
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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Public formatters ────────────────────────────────────────────────────────

/**
 * Format a date string or Date to "DD-Mon-YYYY".
 * e.g. "2026-07-19T00:00:00" → "19-Jul-2026"
 *      "2026-07-06T00:00:00" → "06-Jul-2026"
 */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? parseLocalDate(d) : d;
  const day = String(date.getDate()).padStart(2, '0');
  const mon = MONTHS[date.getMonth()];
  const yr  = date.getFullYear();
  return `${day}-${mon}-${yr}`;
}

/**
 * Format a time string "HH:MM" or "HH:MM:SS" → "hh:mm AM/PM" (leading zero on hour).
 * e.g. "09:30:00" → "09:30 AM"
 *      "13:00"    → "01:00 PM"
 *      "00:00"    → "12:00 AM"
 */
export function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
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

/**
 * Check whether a project's scheduled end datetime has already passed.
 *
 * Storage convention:
 *   - Date columns (oneTimeDate, recurEnd, flexToDate) → "YYYY-MM-DD" local calendar date.
 *   - sessionEndTime → "HH:MM:SS" stored in IST as entered by the admin (e.g. "12:00:00" = noon IST).
 *
 * To build the correct UTC moment: new Date(`${datePart}T${timePart}+05:30`)
 * Default timePart "23:59:59" IST — safe end-of-day fallback.
 *
 * Works for all three project types:
 *   ONE_TIME  → oneTimeDate  + sessionEndTime
 *   RECURRING → recurEnd     + sessionEndTime
 *   OPEN      → flexToDate   (end of day — no session time)
 */
export function isProjectExpired(p: {
  projectTypeCode?: string | null;
  scheduleType?:    string | null;
  oneTimeDate?:     string | null;
  recurEnd?:        string | null;
  flexToDate?:      string | null;
  sessionEndTime?:  string | null;
}): boolean {
  const typeCode = (p.projectTypeCode ?? p.scheduleType ?? '').toUpperCase();

  let endDateStr: string | null | undefined;
  if (typeCode === 'ONE_TIME')   endDateStr = p.oneTimeDate;
  else if (typeCode === 'RECURRING') endDateStr = p.recurEnd;
  else                           endDateStr = p.flexToDate; // OPEN / FLEXIBLE

  if (!endDateStr) return false;

  const datePart = endDateStr.split('T')[0];               // "YYYY-MM-DD"
  const timePart = p.sessionEndTime ?? '23:59:59';         // IST; default = end of day
  const endUTC   = new Date(`${datePart}T${timePart}+05:30`);
  return !isNaN(endUTC.getTime()) && endUTC.getTime() < Date.now();
}
