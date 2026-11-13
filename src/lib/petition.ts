import type { Mode } from '../env';
import { sha256Hex } from './crypto';

export interface PetitionVersion {
  id: string;
  mode: Mode;
  title: string;
  body_markdown: string;
  attestation_text: string;
  sha256: string;
  source_note: string | null;
  active: number;
  created_at: string;
  published_at: string | null;
}

/** Canonical hash input: title, body and attestation separated by blank lines. */
export function versionHashInput(title: string, body: string, attestation: string): string {
  return `${title}\n\n${body}\n\n${attestation}`;
}

export async function versionHash(title: string, body: string, attestation: string): Promise<string> {
  return sha256Hex(versionHashInput(title, body, attestation));
}

export async function getActiveVersion(db: D1Database): Promise<PetitionVersion | null> {
  return db.prepare('SELECT * FROM petition_versions WHERE active = 1').first<PetitionVersion>();
}

export async function getVersion(db: D1Database, id: string): Promise<PetitionVersion | null> {
  return db.prepare('SELECT * FROM petition_versions WHERE id = ?').bind(id).first<PetitionVersion>();
}

export async function listVersions(db: D1Database): Promise<PetitionVersion[]> {
  const { results } = await db
    .prepare('SELECT * FROM petition_versions ORDER BY created_at DESC')
    .all<PetitionVersion>();
  return results;
}

export async function createDraftVersion(
  db: D1Database,
  input: { mode: Mode; title: string; body: string; attestation: string; sourceNote: string },
  now: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const hash = await versionHash(input.title, input.body, input.attestation);
  await db
    .prepare(
      `INSERT INTO petition_versions (id, mode, title, body_markdown, attestation_text, sha256, source_note, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(id, input.mode, input.title, input.body, input.attestation, hash, input.sourceNote || null, now)
    .run();
  return id;
}

/**
 * Publish: deactivate the current version and activate this one in one batch (atomic).
 * Publishing also moves the site into the version's mode unless the site is closed.
 */
export async function publishVersion(db: D1Database, id: string, now: string): Promise<void> {
  const v = await getVersion(db, id);
  if (!v) throw new Error('Version not found');
  await db.batch([
    db.prepare('UPDATE petition_versions SET active = 0 WHERE active = 1 AND id != ?').bind(id),
    db
      .prepare('UPDATE petition_versions SET active = 1, published_at = COALESCE(published_at, ?) WHERE id = ?')
      .bind(now, id),
    db
      .prepare(
        `UPDATE settings SET value = ? WHERE key = 'site_mode' AND value != 'closed' AND value != ?`,
      )
      .bind(v.mode, v.mode),
  ]);
}
