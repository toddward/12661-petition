import type { Mode } from '../env';
import { randomToken, sha256Hex } from './crypto';
import type { RequestMeta } from './log';
import { hoursAgoIso } from './time';
import type { Relationship } from './validate';

export interface SignatureRow {
  id: string;
  household_id: string;
  petition_version_id: string;
  mode: Mode;
  full_name: string;
  email: string;
  phone: string | null;
  relationship: Relationship;
  attest_adult: number;
  attest_resident: number;
  typed_signature: string;
  drawn_signature_key: string | null;
  updates_opt_in: number;
  signed_at: string;
  email_confirmed_at: string | null;
  status: 'active' | 'withdrawn' | 'rejected';
  status_reason: string | null;
  status_changed_at: string | null;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  cf_country: string | null;
  cf_asn: number | null;
  flags: string | null;
  entry_method: 'online' | 'paper';
  followup_sent_at: string | null;
}

export type SignatureWithAddress = SignatureRow & { household_label: string };

export const SHARED_IP_THRESHOLD = 3;

/** Soft review flags (spec §6 step 10). Never blocking. */
export async function computeFlags(
  db: D1Database,
  input: { householdId: string; email: string; fullName: string; ip: string | null; country: string | null },
  now: Date = new Date(),
): Promise<string[]> {
  const flags: string[] = [];
  const queries: D1PreparedStatement[] = [
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM signatures WHERE ip_address = ? AND status = 'active' AND signed_at > ?`,
      )
      .bind(input.ip ?? '', hoursAgoIso(24, now)),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM signatures WHERE email = ? AND email != '' AND household_id != ? AND status = 'active'`,
      )
      .bind(input.email, input.householdId),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM signatures WHERE lower(full_name) = lower(?) AND household_id != ? AND status = 'active'`,
      )
      .bind(input.fullName, input.householdId),
  ];
  const [ip, email, name] = await db.batch<{ n: number }>(queries);
  if (input.ip && (ip?.results[0]?.n ?? 0) >= SHARED_IP_THRESHOLD) flags.push('shared_ip');
  if (input.email && (email?.results[0]?.n ?? 0) > 0) flags.push('email_reused');
  if ((name?.results[0]?.n ?? 0) > 0) flags.push('name_reused');
  if (input.country && input.country !== 'US') flags.push('non_us');
  return flags;
}

export interface NewSignature {
  householdId: string;
  versionId: string;
  mode: Mode;
  fullName: string;
  email: string;
  phone: string | null;
  relationship: Relationship;
  typedSignature: string;
  updatesOptIn: boolean;
  signedAt: string;
  meta: RequestMeta | null;
  flags: string[];
  entryMethod: 'online' | 'paper';
  statusReason?: string | null;
}

export type InsertResult = { ok: true; id: string; token: string } | { ok: false; reason: 'duplicate' };

export function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String((err as Error)?.message ?? err));
}

/**
 * Inserts in a single statement and relies on the partial unique index
 * `one_active_per_household` for the one-per-household rule (spec §6 step 9).
 */
export async function insertSignature(db: D1Database, s: NewSignature): Promise<InsertResult> {
  const id = crypto.randomUUID();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  try {
    await db
      .prepare(
        `INSERT INTO signatures (
           id, household_id, petition_version_id, mode, full_name, email, phone, relationship,
           attest_adult, attest_resident, typed_signature, updates_opt_in, signed_at, status,
           status_reason, token_hash, ip_address, user_agent, cf_country, cf_asn, flags, entry_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        s.householdId,
        s.versionId,
        s.mode,
        s.fullName,
        s.email,
        s.phone || null,
        s.relationship,
        s.typedSignature,
        s.updatesOptIn ? 1 : 0,
        s.signedAt,
        s.statusReason ?? null,
        tokenHash,
        s.meta?.ip ?? null,
        s.meta?.userAgent ?? null,
        s.meta?.country ?? null,
        s.meta?.asn ?? null,
        s.flags.length ? JSON.stringify(s.flags) : null,
        s.entryMethod,
      )
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate' };
    throw err;
  }
  return { ok: true, id, token };
}

export function isWellFormedToken(token: string | undefined | null): token is string {
  return !!token && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function findByToken(db: D1Database, token: string | undefined | null): Promise<SignatureWithAddress | null> {
  if (!isWellFormedToken(token)) return null;
  const hash = await sha256Hex(token);
  return db
    .prepare(
      `SELECT s.*, h.label AS household_label FROM signatures s
       JOIN households h ON h.id = s.household_id WHERE s.token_hash = ?`,
    )
    .bind(hash)
    .first<SignatureWithAddress>();
}

export async function getSignature(db: D1Database, id: string): Promise<SignatureWithAddress | null> {
  return db
    .prepare(
      `SELECT s.*, h.label AS household_label FROM signatures s
       JOIN households h ON h.id = s.household_id WHERE s.id = ?`,
    )
    .bind(id)
    .first<SignatureWithAddress>();
}

export function parseFlags(flags: string | null): string[] {
  if (!flags) return [];
  try {
    const v = JSON.parse(flags);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const FLAG_LABELS: Record<string, string> = {
  shared_ip: 'Shared IP (3+ in 24 h)',
  email_reused: 'Email used at another address',
  name_reused: 'Name used at another address',
  non_us: 'Submitted from outside the US',
};

export const RELATIONSHIP_LABELS: Record<string, string> = {
  owner: 'Owner',
  renter: 'Renter',
  resident: 'Other adult resident',
};
