import { nowIso } from './time';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  country: string | null;
  asn: number | null;
}

export function requestMeta(req: Request): RequestMeta {
  const cf = (req as Request & { cf?: { country?: string; asn?: number } }).cf;
  const ua = req.headers.get('User-Agent');
  return {
    ip: req.headers.get('CF-Connecting-IP'),
    userAgent: ua ? ua.slice(0, 512) : null,
    country: typeof cf?.country === 'string' ? cf.country : null,
    asn: typeof cf?.asn === 'number' ? cf.asn : null,
  };
}

export type SubmissionEvent =
  | 'sign_ok'
  | 'duplicate_household'
  | 'invalid_address'
  | 'turnstile_fail'
  | 'rate_limited'
  | 'too_fast'
  | 'form_expired'
  | 'version_mismatch'
  | 'validation_error'
  | 'closed'
  | 'honeypot'
  | 'withdraw'
  | 'confirm_email'
  | 'unsubscribe';

export function submissionLogStmt(
  db: D1Database,
  event: SubmissionEvent,
  meta: RequestMeta,
  extra: { signatureId?: string | null; householdId?: string | null; detail?: Record<string, unknown> } = {},
): D1PreparedStatement {
  const detail = extra.detail ? JSON.stringify(extra.detail).slice(0, 1000) : null;
  return db
    .prepare(
      `INSERT INTO submission_log (id, event, signature_id, household_id, ip_address, user_agent, cf_country, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      event,
      extra.signatureId ?? null,
      extra.householdId ?? null,
      meta.ip,
      meta.userAgent,
      meta.country,
      detail,
      nowIso(),
    );
}

export async function logSubmission(
  db: D1Database,
  event: SubmissionEvent,
  meta: RequestMeta,
  extra: Parameters<typeof submissionLogStmt>[3] = {},
): Promise<void> {
  await submissionLogStmt(db, event, meta, extra).run();
}

export type AdminAction =
  | 'export_csv'
  | 'print'
  | 'reject'
  | 'restore'
  | 'edit_household'
  | 'import_households'
  | 'set_mode'
  | 'publish_version'
  | 'create_version'
  | 'purge'
  | 'paper_entry'
  | 'mark_vacant'
  | 'bulk_area'
  | 'update_settings'
  | 'send_followups'
  | 'view_signature';

export function adminAuditStmt(
  db: D1Database,
  adminEmail: string,
  action: AdminAction,
  target: string | null,
  detail?: Record<string, unknown> | string | null,
): D1PreparedStatement {
  const d = detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail);
  return db
    .prepare('INSERT INTO admin_audit (id, admin_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), adminEmail, action, target, d ? d.slice(0, 2000) : null, nowIso());
}

export async function audit(
  db: D1Database,
  adminEmail: string,
  action: AdminAction,
  target: string | null,
  detail?: Record<string, unknown> | string | null,
): Promise<void> {
  await adminAuditStmt(db, adminEmail, action, target, detail).run();
}
