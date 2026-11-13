import type { SiteMode } from '../env';

/**
 * Address normalisation (spec §6): lowercase, collapse whitespace, expand common
 * abbreviations, remove punctuation. Used for the `normalized` column and for search.
 */
const ABBREVIATIONS: Record<string, string> = {
  ln: 'lane',
  lp: 'loop',
  dr: 'drive',
  ct: 'court',
  rd: 'road',
  st: 'street',
  apt: 'unit',
  ste: 'unit',
  suite: 'unit',
};

function tokens(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function normalizeText(input: string): string {
  const words = tokens(input);
  return words
    .map((w, i) => {
      // "St" at the start of a street name is usually "Saint"; only expand it as a suffix.
      if (w === 'st' && i < words.length - 1 && words[i + 1] !== 'unit' && words[i + 1] !== 'apt') return w;
      return ABBREVIATIONS[w] ?? w;
    })
    .join(' ');
}

function unitCore(unit: string): string {
  return normalizeText(unit).replace(/^(unit|apt|ste|suite|no)\s*/, '').trim();
}

export function normalizeHousehold(streetNumber: string, streetName: string, unit?: string | null): string {
  const base = normalizeText(`${streetNumber} ${streetName}`);
  const u = unit ? unitCore(unit) : '';
  return u ? `${base} unit ${u}` : base;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function householdLabel(streetNumber: string, streetName: string, unit?: string | null): string {
  const base = `${tidy(streetNumber)} ${tidy(streetName)}`;
  const u = unit ? tidy(unit) : '';
  if (!u) return base;
  return /^(apt|unit|ste|suite|#)/i.test(u) ? `${base}, ${u}` : `${base}, Unit ${u}`;
}

export interface HouseholdRow {
  id: string;
  street_number: string;
  street_name: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  label: string;
  normalized: string;
  in_petition_area: number;
  occupied: number;
  active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** True once at least one household is marked as inside the county-defined petition area. */
export async function isAreaDefined(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare('SELECT EXISTS(SELECT 1 FROM households WHERE in_petition_area = 1) AS defined')
    .first<{ defined: number }>();
  return row?.defined === 1;
}

/**
 * SQL condition (on table alias-free `households`) for which households may sign right now.
 * Spec §6 step 8: in-area + active; while the area is undefined, any active household,
 * pledge mode only. Returns null when nobody can sign.
 */
export function eligibilityCondition(areaDefined: boolean, mode: SiteMode): string | null {
  if (mode === 'closed') return null;
  if (areaDefined) return 'active = 1 AND in_petition_area = 1';
  if (mode === 'pledge') return 'active = 1';
  return null;
}

export async function getEligibleHousehold(
  db: D1Database,
  id: string,
  mode: SiteMode,
): Promise<HouseholdRow | null> {
  const cond = eligibilityCondition(await isAreaDefined(db), mode);
  if (!cond) return null;
  return db.prepare(`SELECT * FROM households WHERE id = ? AND ${cond}`).bind(id).first<HouseholdRow>();
}

const ORDER_BY = `street_name COLLATE NOCASE, CAST(street_number AS INTEGER), street_number, unit`;

export async function searchHouseholds(
  db: D1Database,
  query: string,
  mode: SiteMode,
  limit = 10,
): Promise<{ id: string; label: string }[]> {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const cond = eligibilityCondition(await isAreaDefined(db), mode);
  if (!cond) return [];
  // normalizeText strips everything but [a-z0-9 ], so q cannot contain LIKE wildcards.
  const { results } = await db
    .prepare(
      `SELECT id, label FROM households
       WHERE ${cond}
         AND (normalized LIKE ?1 || '%'
              OR lower(street_number || ' ' || street_name) LIKE ?1 || '%'
              OR normalized LIKE '% ' || ?1 || '%')
       ORDER BY ${ORDER_BY}
       LIMIT ?2`,
    )
    .bind(q, limit)
    .all<{ id: string; label: string }>();
  return results;
}

export interface StreetGroup {
  street: string;
  households: { id: string; label: string }[];
}

/** All eligible households grouped by street, for the no-JS <select> fallback. */
export async function listEligibleByStreet(db: D1Database, mode: SiteMode): Promise<StreetGroup[]> {
  const cond = eligibilityCondition(await isAreaDefined(db), mode);
  if (!cond) return [];
  const { results } = await db
    .prepare(`SELECT id, label, street_name FROM households WHERE ${cond} ORDER BY ${ORDER_BY}`)
    .all<{ id: string; label: string; street_name: string }>();
  const groups: StreetGroup[] = [];
  for (const r of results) {
    let g = groups[groups.length - 1];
    if (!g || g.street.toLowerCase() !== r.street_name.toLowerCase()) {
      g = { street: r.street_name, households: [] };
      groups.push(g);
    }
    g.households.push({ id: r.id, label: r.label });
  }
  return groups;
}
