/** Household import (CSV → diff → apply) and edits (spec §10.2 "Households"). */
import { householdLabel, normalizeHousehold, type HouseholdRow } from './address';
import { parseCsv } from './csv';
import { cleanString } from './validate';

export const IMPORT_COLUMNS = ['street_number', 'street_name', 'unit', 'zip', 'in_petition_area', 'occupied', 'notes'] as const;

export interface ImportRow {
  line: number;
  street_number: string;
  street_name: string;
  unit: string | null;
  zip: string;
  /** null = column blank: keep the current value (new rows use the default). */
  in_petition_area: 0 | 1 | null;
  occupied: 0 | 1 | null;
  notes: string | null;
  normalized: string;
  label: string;
}

export interface ImportChange {
  row: ImportRow;
  existing: HouseholdRow;
  changes: { field: string; from: string; to: string }[];
}

export interface ImportDiff {
  added: ImportRow[];
  changed: ImportChange[];
  unchanged: number;
  errors: { line: number; message: string }[];
  /** Active households in the database that are not in the file. */
  missing: HouseholdRow[];
}

function parseFlag(v: string): 0 | 1 | null | 'bad' {
  const s = v.trim().toLowerCase();
  if (s === '') return null;
  if (['1', 'true', 'yes', 'y', 'x'].includes(s)) return 1;
  if (['0', 'false', 'no', 'n'].includes(s)) return 0;
  return 'bad';
}

export function parseImportCsv(text: string): { rows: ImportRow[]; errors: { line: number; message: string }[] } {
  const table = parseCsv(text);
  const errors: { line: number; message: string }[] = [];
  if (!table.length) return { rows: [], errors: [{ line: 1, message: 'The file is empty.' }] };
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const col of IMPORT_COLUMNS) idx[col] = header.indexOf(col);
  for (const col of ['street_number', 'street_name', 'zip'] as const) {
    if (idx[col] === -1) errors.push({ line: 1, message: `Missing required column "${col}".` });
  }
  if (errors.length) return { rows: [], errors };

  const get = (r: string[], col: string) => {
    const i = idx[col] ?? -1;
    return i >= 0 ? cleanString(r[i] ?? '', 200) : '';
  };
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const street_number = get(r, 'street_number');
    const street_name = get(r, 'street_name').replace(/\s+/g, ' ');
    const unit = get(r, 'unit') || null;
    const zip = get(r, 'zip');
    const area = parseFlag(get(r, 'in_petition_area'));
    const occ = parseFlag(get(r, 'occupied'));
    const notes = get(r, 'notes') || null;
    const problems: string[] = [];
    if (!/^\d+[A-Za-z]?(-\d+)?$/.test(street_number)) problems.push('street_number must be a house number');
    if (!street_name) problems.push('street_name is required');
    if (!/^\d{5}(-\d{4})?$/.test(zip)) problems.push('zip must be 5 digits');
    if (area === 'bad') problems.push('in_petition_area must be 1/0, yes/no, true/false or blank');
    if (occ === 'bad') problems.push('occupied must be 1/0, yes/no, true/false or blank');
    if (problems.length) {
      errors.push({ line, message: problems.join('; ') });
      return;
    }
    const normalized = normalizeHousehold(street_number, street_name, unit);
    const dup = seen.get(normalized);
    if (dup) {
      errors.push({ line, message: `Same address as line ${dup}.` });
      return;
    }
    seen.set(normalized, line);
    rows.push({
      line,
      street_number,
      street_name,
      unit,
      zip,
      in_petition_area: area as 0 | 1 | null,
      occupied: occ as 0 | 1 | null,
      notes,
      normalized,
      label: householdLabel(street_number, street_name, unit),
    });
  });
  return { rows, errors };
}

export async function diffImport(db: D1Database, rows: ImportRow[]): Promise<Omit<ImportDiff, 'errors'>> {
  const { results: existing } = await db.prepare('SELECT * FROM households').all<HouseholdRow>();
  const byNorm = new Map(existing.map((h) => [h.normalized, h]));
  const inFile = new Set(rows.map((r) => r.normalized));
  const added: ImportRow[] = [];
  const changed: ImportChange[] = [];
  let unchanged = 0;
  for (const row of rows) {
    const h = byNorm.get(row.normalized);
    if (!h) {
      added.push(row);
      continue;
    }
    const changes: ImportChange['changes'] = [];
    const cmp = (field: string, from: unknown, to: unknown) => {
      if (String(from ?? '') !== String(to ?? '')) changes.push({ field, from: String(from ?? ''), to: String(to ?? '') });
    };
    cmp('label', h.label, row.label);
    cmp('zip', h.zip, row.zip);
    if (row.in_petition_area !== null) cmp('in_petition_area', h.in_petition_area, row.in_petition_area);
    if (row.occupied !== null) cmp('occupied', h.occupied, row.occupied);
    if (row.notes !== null) cmp('notes', h.notes, row.notes);
    if (!h.active) changes.push({ field: 'active', from: '0', to: '1' });
    if (changes.length) changed.push({ row, existing: h, changes });
    else unchanged++;
  }
  const missing = existing.filter((h) => h.active && !inFile.has(h.normalized));
  return { added, changed, unchanged, missing };
}

/** Applies a previewed import. Returns counts. Runs in D1 batches (each batch is atomic). */
export async function applyImport(
  db: D1Database,
  rows: ImportRow[],
  opts: { deactivateMissing: boolean; now: string },
): Promise<{ added: number; updated: number; deactivated: number }> {
  const diff = await diffImport(db, rows);
  const stmts: D1PreparedStatement[] = [];
  for (const r of diff.added) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO households (id, street_number, street_name, unit, zip, label, normalized, in_petition_area, occupied, active, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          r.street_number,
          r.street_name,
          r.unit,
          r.zip,
          r.label,
          r.normalized,
          r.in_petition_area ?? 0,
          r.occupied ?? 1,
          r.notes,
          opts.now,
          opts.now,
        ),
    );
  }
  for (const c of diff.changed) {
    const r = c.row;
    stmts.push(
      db
        .prepare(
          `UPDATE households SET street_number = ?, street_name = ?, unit = ?, zip = ?, label = ?,
             in_petition_area = COALESCE(?, in_petition_area), occupied = COALESCE(?, occupied),
             notes = COALESCE(?, notes), active = 1, updated_at = ?
           WHERE id = ?`,
        )
        .bind(r.street_number, r.street_name, r.unit, r.zip, r.label, r.in_petition_area, r.occupied, r.notes, opts.now, c.existing.id),
    );
  }
  if (opts.deactivateMissing) {
    for (const h of diff.missing) {
      stmts.push(db.prepare('UPDATE households SET active = 0, updated_at = ? WHERE id = ?').bind(opts.now, h.id));
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return {
    added: diff.added.length,
    updated: diff.changed.length,
    deactivated: opts.deactivateMissing ? diff.missing.length : 0,
  };
}

export async function getHousehold(db: D1Database, id: string): Promise<HouseholdRow | null> {
  return db.prepare('SELECT * FROM households WHERE id = ?').bind(id).first<HouseholdRow>();
}

export async function listStreets(db: D1Database): Promise<{ street_name: string; total: number; in_area: number; occupied_in_area: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT street_name, COUNT(*) AS total,
              SUM(CASE WHEN in_petition_area = 1 THEN 1 ELSE 0 END) AS in_area,
              SUM(CASE WHEN in_petition_area = 1 AND occupied = 1 THEN 1 ELSE 0 END) AS occupied_in_area
       FROM households WHERE active = 1
       GROUP BY street_name COLLATE NOCASE ORDER BY street_name COLLATE NOCASE`,
    )
    .all<{ street_name: string; total: number; in_area: number; occupied_in_area: number }>();
  return results;
}
