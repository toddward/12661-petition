/** Daily retention job (spec §14). */
import { adminAuditStmt } from './log';
import { getSettings } from './settings';
import { addDays, daysAgoIso, localDateToIso } from './time';

export const WITHDRAWN_SCRUB_DAYS = 30;
export const PROTECT_DAYS = 365;
export const POST_DECISION_DAYS = 90;

export interface RetentionResult {
  ip_cleared: number;
  logs_deleted: number;
  withdrawn_scrubbed: number;
  signatures_deleted: number;
  drawn_keys_cleared: string[];
}

export async function runRetention(
  db: D1Database,
  now: Date = new Date(),
  opts: { bucket?: R2Bucket; actor?: string } = {},
): Promise<RetentionResult> {
  const s = await getSettings(db);
  const ipCutoff = daysAgoIso(Math.max(1, s.retention_days_ip), now);
  const allCutoff = daysAgoIso(Math.max(1, s.retention_days_all), now);
  const withdrawnCutoff = daysAgoIso(WITHDRAWN_SCRUB_DAYS, now);
  const protectCutoff = daysAgoIso(PROTECT_DAYS, now);

  const decisionIso = s.final_decision_date ? localDateToIso(s.final_decision_date) : null;
  const decisionPassed = !!decisionIso && addDays(decisionIso, POST_DECISION_DAYS) < now;
  // Step 5 guard: while the campaign is not closed, never delete anything younger than 365 days.
  const protect = s.site_mode !== 'closed';
  const guardSig = protect ? 'AND signed_at < ?' : '';
  const guardLog = protect ? 'AND created_at < ?' : '';

  // Drawn-signature images that will no longer be referenced (scrubbed or deleted rows).
  const deleteWhere = `(${decisionPassed ? '1 = 1' : 'signed_at < ?'}) ${guardSig}`;
  const deleteBinds = [...(decisionPassed ? [] : [allCutoff]), ...(protect ? [protectCutoff] : [])];
  const { results: keyRows } = await db
    .prepare(
      `SELECT drawn_signature_key AS k FROM signatures WHERE drawn_signature_key IS NOT NULL
         AND ((status = 'withdrawn' AND status_changed_at < ?) OR (${deleteWhere}))`,
    )
    .bind(withdrawnCutoff, ...deleteBinds)
    .all<{ k: string }>();
  const drawnKeys = keyRows.map((r) => r.k);

  const stmts: D1PreparedStatement[] = [
    // 1. Clear IP and browser details after retention_days_ip.
    db
      .prepare(
        `UPDATE signatures SET ip_address = NULL, user_agent = NULL, cf_asn = NULL
         WHERE signed_at < ? AND (ip_address IS NOT NULL OR user_agent IS NOT NULL OR cf_asn IS NOT NULL)`,
      )
      .bind(ipCutoff),
    // 2. Drop old submission logs.
    db.prepare('DELETE FROM submission_log WHERE created_at < ?').bind(ipCutoff),
    // 3. Scrub withdrawn signatures after 30 days; keep household, dates and status.
    db
      .prepare(
        `UPDATE signatures SET full_name = '[withdrawn]', email = '', phone = NULL, typed_signature = '[withdrawn]',
           ip_address = NULL, user_agent = NULL, cf_asn = NULL, drawn_signature_key = NULL
         WHERE status = 'withdrawn' AND status_changed_at < ? AND full_name != '[withdrawn]'`,
      )
      .bind(withdrawnCutoff),
    // 4. Delete signatures past retention_days_all, or everything 90 days after the county's decision.
    db.prepare(`DELETE FROM signatures WHERE ${deleteWhere}`).bind(...deleteBinds),
  ];
  if (decisionPassed) {
    stmts.push(db.prepare(`DELETE FROM submission_log WHERE 1 = 1 ${guardLog}`).bind(...(protect ? [protectCutoff] : [])));
  }
  // Logs that pointed at deleted signatures.
  stmts.push(
    db.prepare(
      'DELETE FROM submission_log WHERE signature_id IS NOT NULL AND signature_id NOT IN (SELECT id FROM signatures)',
    ),
  );

  const res = await db.batch(stmts);
  const changes = (i: number) => res[i]?.meta.changes ?? 0;
  const logsDeleted = changes(1) + (decisionPassed ? changes(4) : 0) + changes(res.length - 1);
  const result: RetentionResult = {
    ip_cleared: changes(0),
    logs_deleted: logsDeleted,
    withdrawn_scrubbed: changes(2),
    signatures_deleted: changes(3),
    drawn_keys_cleared: drawnKeys,
  };

  if (opts.bucket && drawnKeys.length) {
    await opts.bucket.delete(drawnKeys);
  }

  await adminAuditStmt(db, opts.actor ?? 'system:cron', 'purge', null, {
    ip_cleared: result.ip_cleared,
    logs_deleted: result.logs_deleted,
    withdrawn_scrubbed: result.withdrawn_scrubbed,
    signatures_deleted: result.signatures_deleted,
    drawn_images_deleted: drawnKeys.length,
    decision_passed: decisionPassed,
    protected: protect,
  }).run();

  return result;
}
