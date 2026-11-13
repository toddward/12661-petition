export const SITE_TZ = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

export function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export function hoursAgoIso(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function parts(iso: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, ...opts });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** "2026-11-13 15:04:05 EST" in America/New_York, for CSV export. */
export function formatLocalDateTime(iso: string): string {
  const p = parts(iso, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}`;
}

/** "Nov 13, 2026" in America/New_York. */
export function formatLocalDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, dateStyle: 'medium' }).format(new Date(iso));
}

/** "November 13, 2026" in America/New_York. */
export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, dateStyle: 'long' }).format(new Date(iso));
}

/** "Nov 13, 2026, 3:04 PM" in America/New_York. */
export function formatLocalShort(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** "YYYYMMDD" in America/New_York, for export filenames. */
export function localDateStamp(now: Date = new Date()): string {
  const p = parts(now.toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}${p.month}${p.day}`;
}

/**
 * Converts a calendar date typed by an admin (YYYY-MM-DD, local to Virginia) into a UTC
 * ISO timestamp at noon Eastern, so the date never shifts when shown in America/New_York.
 */
export function localDateToIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  // 17:00 UTC is 12:00 EST / 13:00 EDT: always the same calendar day in New York.
  const dt = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString();
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY_MS);
}

export function addDays(iso: string, days: number): Date {
  return new Date(new Date(iso).getTime() + days * DAY_MS);
}
