/** Read-side queries for the admin area. */
import type { Mode } from '../env';
import type { SignatureWithAddress } from './signatures';
import { SITE_TZ } from './time';

/** UTC ISO instant of local midnight (America/New_York) at the start of `date` (YYYY-MM-DD). */
export function localMidnightIso(date: string, plusDays = 0): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  // Try EDT (UTC-4) then EST (UTC-5); keep the one that is midnight in New York.
  for (const offset of [4, 5]) {
    const t = new Date(Date.UTC(y, m - 1, d + plusDays, offset, 0, 0));
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: SITE_TZ, hour: '2-digit', hourCycle: 'h23' }).format(t);
    if (hour === '00') return t.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d + plusDays, 5, 0, 0)).toISOString();
}

export interface SignatureFilters {
  status: string; // active | withdrawn | rejected | all
  mode: string; // pledge | petition | ''
  flagged: boolean;
  unconfirmed: boolean;
  entry: string; // online | paper | ''
  street: string;
  from: string;
  to: string;
  q: string;
  sort: string; // signed_at | name | address | status
  dir: 'asc' | 'desc';
  page: number;
}

export function parseSignatureFilters(q: Record<string, string | undefined>): SignatureFilters {
  const status = ['active', 'withdrawn', 'rejected', 'all'].includes(q.status ?? '') ? q.status! : 'active';
  const mode = q.mode === 'pledge' || q.mode === 'petition' ? q.mode : '';
  const sort = ['signed_at', 'name', 'address', 'status'].includes(q.sort ?? '') ? q.sort! : 'signed_at';
  return {
    status,
    mode,
    flagged: q.flagged === '1',
    unconfirmed: q.unconfirmed === '1',
    entry: q.entry === 'online' || q.entry === 'paper' ? q.entry : '',
    street: (q.street ?? '').slice(0, 100),
    from: /^\d{4}-\d{2}-\d{2}$/.test(q.from ?? '') ? q.from! : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(q.to ?? '') ? q.to! : '',
    q: (q.q ?? '').trim().slice(0, 100),
    sort,
    dir: q.dir === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number.parseInt(q.page ?? '1', 10) || 1),
  };
}

export const PAGE_SIZE = 100;

export async function listSignatures(
  db: D1Database,
  f: SignatureFilters,
): Promise<{ rows: SignatureWithAddress[]; total: number }> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (f.status !== 'all') {
    where.push('s.status = ?');
    binds.push(f.status);
  }
  if (f.mode) {
    where.push('s.mode = ?');
    binds.push(f.mode);
  }
  if (f.flagged) where.push("s.flags IS NOT NULL AND s.flags != '[]'");
  if (f.unconfirmed) where.push("s.email_confirmed_at IS NULL AND s.entry_method = 'online'");
  if (f.entry) {
    where.push('s.entry_method = ?');
    binds.push(f.entry);
  }
  if (f.street) {
    where.push('h.street_name = ? COLLATE NOCASE');
    binds.push(f.street);
  }
  const from = f.from ? localMidnightIso(f.from) : null;
  if (from) {
    where.push('s.signed_at >= ?');
    binds.push(from);
  }
  const to = f.to ? localMidnightIso(f.to, 1) : null;
  if (to) {
    where.push('s.signed_at < ?');
    binds.push(to);
  }
  if (f.q) {
    where.push("(lower(s.full_name) LIKE ? ESCAPE '\\' OR s.email LIKE ? ESCAPE '\\')");
    const like = `%${f.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    binds.push(like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  const orderSql =
    f.sort === 'name'
      ? `lower(s.full_name) ${dir}, s.signed_at DESC`
      : f.sort === 'address'
        ? `h.street_name COLLATE NOCASE ${dir}, CAST(h.street_number AS INTEGER) ${dir}, h.unit ${dir}`
        : f.sort === 'status'
          ? `s.status ${dir}, s.signed_at DESC`
          : `s.signed_at ${dir}`;
  const [count, rows] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM signatures s JOIN households h ON h.id = s.household_id ${whereSql}`).bind(...binds),
    db
      .prepare(
        `SELECT s.*, h.label AS household_label FROM signatures s JOIN households h ON h.id = s.household_id
         ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      )
      .bind(...binds, PAGE_SIZE, (f.page - 1) * PAGE_SIZE),
  ]);
  return {
    total: (count?.results[0] as { n: number } | undefined)?.n ?? 0,
    rows: (rows?.results ?? []) as SignatureWithAddress[],
  };
}

export interface DashboardStats {
  byModeStatus: { mode: Mode; status: string; n: number }[];
  byRelationship: { relationship: string; n: number }[];
  unconfirmed: number;
  flagged: number;
  paper: number;
  oldestActive: string | null;
  households: { total: number; in_area: number; occupied_in_area: number; vacant_in_area: number };
  pledgedNotSigned: number;
}

export async function dashboardStats(db: D1Database, mode: Mode): Promise<DashboardStats> {
  const r = await db.batch([
    db.prepare('SELECT mode, status, COUNT(*) AS n FROM signatures GROUP BY mode, status ORDER BY mode, status'),
    db
      .prepare(`SELECT relationship, COUNT(*) AS n FROM signatures WHERE status = 'active' AND mode = ? GROUP BY relationship`)
      .bind(mode),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM signatures WHERE status = 'active' AND mode = ? AND entry_method = 'online' AND email_confirmed_at IS NULL`,
      )
      .bind(mode),
    db.prepare(`SELECT COUNT(*) AS n FROM signatures WHERE status = 'active' AND flags IS NOT NULL AND flags != '[]'`),
    db.prepare(`SELECT COUNT(*) AS n FROM signatures WHERE status = 'active' AND mode = ? AND entry_method = 'paper'`).bind(mode),
    db.prepare(`SELECT MIN(signed_at) AS d FROM signatures WHERE status = 'active' AND mode = ?`).bind(mode),
    db.prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN in_petition_area = 1 THEN 1 ELSE 0 END), 0) AS in_area,
              COALESCE(SUM(CASE WHEN in_petition_area = 1 AND occupied = 1 THEN 1 ELSE 0 END), 0) AS occupied_in_area,
              COALESCE(SUM(CASE WHEN in_petition_area = 1 AND occupied = 0 THEN 1 ELSE 0 END), 0) AS vacant_in_area
       FROM households WHERE active = 1`,
    ),
    db.prepare(
      `SELECT COUNT(*) AS n FROM signatures p
       WHERE p.mode = 'pledge' AND p.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM signatures s WHERE s.household_id = p.household_id AND s.mode = 'petition' AND s.status = 'active')`,
    ),
  ]);
  const first = <T>(i: number) => r[i]?.results[0] as T | undefined;
  return {
    byModeStatus: (r[0]?.results ?? []) as DashboardStats['byModeStatus'],
    byRelationship: (r[1]?.results ?? []) as DashboardStats['byRelationship'],
    unconfirmed: first<{ n: number }>(2)?.n ?? 0,
    flagged: first<{ n: number }>(3)?.n ?? 0,
    paper: first<{ n: number }>(4)?.n ?? 0,
    oldestActive: first<{ d: string | null }>(5)?.d ?? null,
    households: first<DashboardStats['households']>(6) ?? { total: 0, in_area: 0, occupied_in_area: 0, vacant_in_area: 0 },
    pledgedNotSigned: first<{ n: number }>(7)?.n ?? 0,
  };
}

export interface PledgedRow {
  signature_id: string;
  household_id: string;
  household_label: string;
  full_name: string;
  email: string;
  updates_opt_in: number;
  followup_sent_at: string | null;
  signed_at: string;
}

/** Households with an active pledge but no active petition signature. */
export async function pledgedNotSigned(db: D1Database): Promise<PledgedRow[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS signature_id, p.household_id, h.label AS household_label, p.full_name, p.email,
              p.updates_opt_in, p.followup_sent_at, p.signed_at
       FROM signatures p JOIN households h ON h.id = p.household_id
       WHERE p.mode = 'pledge' AND p.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM signatures s WHERE s.household_id = p.household_id AND s.mode = 'petition' AND s.status = 'active')
       ORDER BY h.street_name COLLATE NOCASE, CAST(h.street_number AS INTEGER), h.unit`,
    )
    .all<PledgedRow>();
  return results;
}
