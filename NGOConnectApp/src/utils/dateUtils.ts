/**
 * Shared date/time formatting utilities for NGO Connect.
 *
 * ── Two kinds of date values in this app ────────────────────────────────────
 *
 * 1. CALENDAR DATES  (project dates, session dates, DOB, registration dates)
 *    Stored as "YYYY-MM-DD" — represent a calendar day independent of timezone.
 *    "Project starts 2026-10-15" means Oct 15 for every user, everywhere.
 *    → Use fmtDate()  /  fmtDateRange()  /  fmtDateTime()
 *    → Parsed with parseLocalDate() — splits on 'T', creates local midnight,
 *      so a UTC offset NEVER shifts the displayed day.
 *
 * 2. UTC TIMESTAMPS  (createdAt, updatedAt, awardedAt, statusUpdatedAt …)
 *    Stored as UTC in DB, returned as ISO-8601 with trailing 'Z' by the API
 *    (enforced by UtcDateTimeConverter on the backend).
 *    "Post created 2026-10-01T08:30:00Z" → Mumbai user sees "01-Oct-2026 02:00 PM IST",
 *    New York user sees "01-Oct-2026 04:30 AM EDT" — automatically correct.
 *    → Use fmtTimestamp()  /  fmtTimestampShort()  /  fmtMonthYear()
 *    → Parsed with parseUtcTs() — appends 'Z' if missing (defensive), lets
 *      the JS engine convert to the device's local timezone.
 *
 * Standard display format: DD-Mon-YYYY  |  hh:mm AM/PM
 * Examples:
 *   26-Jul-2026          (calendar date)
 *   03:59 AM             (time string)
 *   26-Jul-2026 02:00 PM (combined)
 *   26-Jul-2026 – 30-Dec-2026
 *   09:30 AM – 01:00 PM
 *
 * All functions are null-safe — empty string is returned for falsy input.
 */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ─── Core parsers ─────────────────────────────────────────────────────────────

/**
 * Parse a CALENDAR DATE string without timezone shift.
 * Input: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss" (no Z, no offset)
 * Output: local Date at midnight — the day is ALWAYS the day stored in DB.
 *
 * Use for: project dates, session dates, DOB, registration dates.
 * Do NOT use for: createdAt / updatedAt / awardedAt (use parseUtcTs instead).
 */
function parseLocalDate(s: string): Date {
  const datePart = s.split('T')[0];               // "YYYY-MM-DD"
  const [y, mo, d] = datePart.split('-').map(Number);
  return new Date(y, mo - 1, d);                  // local midnight, no UTC shift
}

/**
 * Parse a UTC TIMESTAMP string, converting it to the device's local timezone.
 * Input: ISO-8601 string — with or without trailing 'Z'.
 *   "2026-10-01T08:30:00Z"   → correct (backend adds Z via UtcDateTimeConverter)
 *   "2026-10-01T08:30:00"    → defensive: 'Z' is appended before parsing
 *
 * Use for: createdAt, updatedAt, awardedAt, statusUpdatedAt, lastLoginAt.
 */
function parseUtcTs(s: string): Date {
  // Append 'Z' if no timezone info present — ensures JS treats it as UTC
  const iso = (s.endsWith('Z') || s.includes('+') || /[+-]\d{2}:\d{2}$/.test(s))
    ? s
    : s + 'Z';
  return new Date(iso);
}

// ─── Calendar date formatters (use with project/session/DOB dates) ────────────

/**
 * Format a CALENDAR DATE string or Date to "DD-Mon-YYYY".
 * e.g. "2026-07-19T00:00:00" → "19-Jul-2026"
 *      "2026-07-06"          → "06-Jul-2026"
 *
 * Safe for project dates, session dates, DOB, registration dates.
 * For createdAt/timestamps use fmtTimestamp() instead.
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
 *
 * Input is treated as a plain time-of-day string (no timezone involved).
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
 * Combine a CALENDAR DATE string + optional time string → "DD-Mon-YYYY hh:mm AM/PM"
 * If timeStr is absent, returns just "DD-Mon-YYYY".
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
 * Format a CALENDAR DATE range → "DD-Mon-YYYY – DD-Mon-YYYY"
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
 * Format a time range → "hh:mm AM/PM – hh:mm AM/PM"
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

// ─── UTC timestamp formatters (use with createdAt / awardedAt / etc.) ─────────

/**
 * Format a UTC TIMESTAMP to "DD-Mon-YYYY" in the device's LOCAL timezone.
 * e.g. "2026-10-01T08:30:00Z" → "01-Oct-2026" (in IST: same day)
 *                             → "01-Oct-2026" (in UTC-5: same day here too)
 *
 * Use for: createdAt, awardedAt, statusUpdatedAt on posts/comments/badges.
 */
export function fmtTimestamp(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = parseUtcTs(ts);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  const yr  = d.getFullYear();
  return `${day}-${mon}-${yr}`;
}

/**
 * Format a UTC TIMESTAMP to "DD-Mon-YYYY hh:mm AM/PM" in the device's LOCAL timezone.
 * e.g. "2026-10-01T08:30:00Z" → "01-Oct-2026 02:00 PM" (IST = UTC+5:30)
 *
 * Use for: detailed timestamps where both date and time matter.
 */
export function fmtTimestampFull(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = parseUtcTs(ts);
  if (isNaN(d.getTime())) return '';
  const day  = String(d.getDate()).padStart(2, '0');
  const mon  = MONTHS[d.getMonth()];
  const yr   = d.getFullYear();
  const h    = d.getHours();
  const m    = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${day}-${mon}-${yr} ${String(h12).padStart(2, '0')}:${m} ${ampm}`;
}

/**
 * Format a UTC TIMESTAMP to "Mon YYYY" (e.g. "Oct 2026") in device's LOCAL timezone.
 * Use for: "On RippleHub since ...", badge awarded month, etc.
 */
export function fmtMonthYear(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = parseUtcTs(ts);
  if (isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format a UTC TIMESTAMP to "Month YYYY" (full month name, e.g. "October 2026").
 */
export function fmtMonthYearFull(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = parseUtcTs(ts);
  if (isNaN(d.getTime())) return '';
  return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Compute a relative time label ("2m ago", "3h ago", "5d ago", "DD-Mon-YYYY")
 * from a UTC TIMESTAMP string. Falls back to fmtTimestamp after 7 days.
 *
 * Use for: post/comment createdAt where "X ago" style is preferred.
 */
export function timeAgoFromUtc(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = parseUtcTs(ts);
  if (isNaN(d.getTime())) return '';
  const diffMs  = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr  < 24) return `${diffHr}h ago`;
  if (diffDay <  7) return `${diffDay}d ago`;
  return fmtTimestamp(ts);
}

// ─── Project expiry check ─────────────────────────────────────────────────────

/**
 * Check whether a project's scheduled end datetime has already passed.
 *
 * Storage convention:
 *   - Date columns (oneTimeDate, recurEnd, flexToDate) → "YYYY-MM-DD"
 *     These are CALENDAR dates entered by admins in IST.
 *   - sessionEndTime → "HH:MM:SS" stored as IST time-of-day.
 *
 * Because these are IST calendar values (not UTC timestamps), we build the
 * end moment as IST by appending +05:30, then compare to UTC now.
 * Default end-of-day: 23:59:59 IST.
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
  if (typeCode === 'ONE_TIME')       endDateStr = p.oneTimeDate;
  else if (typeCode === 'RECURRING') endDateStr = p.recurEnd;
  else                               endDateStr = p.flexToDate; // OPEN / FLEXIBLE

  if (!endDateStr) return false;

  const datePart = endDateStr.split('T')[0];         // "YYYY-MM-DD"
  const timePart = p.sessionEndTime ?? '23:59:59';   // IST time-of-day
  const endUTC   = new Date(`${datePart}T${timePart}+05:30`);
  return !isNaN(endUTC.getTime()) && endUTC.getTime() < Date.now();
}
