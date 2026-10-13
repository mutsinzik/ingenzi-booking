/**
 * Time and date utilities. All formatting uses Intl with the configured timezone.
 * Never do date math in the browser's local timezone.
 */

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function toDateString(date: Date): string {
  // YYYY-MM-DD in the date's own local representation
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatDateFull(dateStr: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export function formatTime(dateStr: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(dateStr));
}

export function formatTimeRange(startStr: string, endStr: string, timezone: string): string {
  return `${formatTime(startStr, timezone)} – ${formatTime(endStr, timezone)}`;
}

export function formatDateTimeFull(startStr: string, endStr: string, timezone: string): string {
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(startStr));
  const timePart = formatTimeRange(startStr, endStr, timezone);
  return `${datePart}, ${timePart}`;
}

export function getHourFromTimeStr(startStr: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(startStr));
  const hourPart = parts.find((p) => p.type === 'hour');
  return parseInt(hourPart?.value ?? '0', 10);
}

export function getMinuteFromTimeStr(startStr: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    minute: '2-digit',
  }).formatToParts(new Date(startStr));
  const minPart = parts.find((p) => p.type === 'minute');
  return parseInt(minPart?.value ?? '0', 10);
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Returns the IANA timezone offset string for a given date and timezone,
 * e.g. "+02:00" or "-05:00". Uses Intl to handle DST correctly.
 */
export function getTimezoneOffsetString(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  const offsetMs = asUtc - date.getTime();
  const sign = offsetMs >= 0 ? '+' : '-';
  const absMs = Math.abs(offsetMs);
  const hours = String(Math.floor(absMs / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((absMs % 3600000) / 60000)).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/**
 * Converts a local date+time in the given timezone to an ISO string with
 * the correct offset, e.g. "2026-10-13T14:00:00+02:00".
 */
export function localToIso(dateStr: string, timeStr: string, timezone: string): string {
  const paddedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const guess = new Date(`${dateStr}T${paddedTime}Z`);
  const offset = getTimezoneOffsetString(guess, timezone);
  return `${dateStr}T${paddedTime}${offset}`;
}

/**
 * Returns the YYYY-MM-DD date string for a given Date in the specified timezone.
 */
export function getDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0';
  const m = parts.find((p) => p.type === 'month')?.value ?? '0';
  const d = parts.find((p) => p.type === 'day')?.value ?? '0';
  return `${y}-${m}-${d}`;
}
