import { Hono, type Context } from 'hono';
import type { AppBindings, Mode, SiteMode } from '../env';
import {
  dashboardStats,
  listSignatures,
  parseSignatureFilters,
  pledgedNotSigned,
} from '../lib/admin-data';
import { getEligibleHousehold, householdLabel, normalizeHousehold, type HouseholdRow } from '../lib/address';
import { sha256Hex, unsubscribeToken } from '../lib/crypto';
import { toCsv } from '../lib/csv';
import { emailEnabled, followupEmail, sendEmail } from '../lib/email';
import { applyImport, diffImport, getHousehold, listStreets, parseImportCsv } from '../lib/households';
import { audit, adminAuditStmt } from '../lib/log';
import {
  createDraftVersion,
  getActiveVersion,
  getVersion,
  listVersions,
  publishVersion,
  type PetitionVersion,
} from '../lib/petition';
import { computeProgress } from '../lib/progress';
import { runRetention } from '../lib/retention';
import { EDITABLE_SETTING_KEYS, getSettings, setSettingStmt } from '../lib/settings';
import {
  computeFlags,
  getSignature,
  insertSignature,
  isUniqueViolation,
  RELATIONSHIP_LABELS,
  type SignatureWithAddress,
} from '../lib/signatures';
import { formatLocalDateTime, localDateStamp, localDateToIso, nowIso } from '../lib/time';
import {
  cleanString,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  RELATIONSHIPS,
  validateNameField,
  type Relationship,
} from '../lib/validate';
import { dashboardPage } from '../views/admin/dashboard';
import {
  householdEditPage,
  householdListPage,
  importFormPage,
  importPreviewPage,
  type HouseholdFilters,
  type HouseholdListRow,
} from '../views/admin/households';
import { auditPage, exportPage, followupsPage, modeConfirmPage, modePage, settingsPage } from '../views/admin/misc';
import {
  publishConfirmPage,
  versionDetailPage,
  versionFormPage,
  versionListPage,
  type VersionFormValues,
} from '../views/admin/petition';
import { printPage, type PrintRow } from '../views/admin/print';
import { paperEntryPage, signatureDetailPage, signatureListPage, type PaperValues } from '../views/admin/signatures';
import { countedMode } from './public';

type Ctx = Context<AppBindings>;

export const adminRoutes = new Hono<AppBindings>();

export const FOLLOWUP_BATCH_SIZE = 40;

const admin = (c: Ctx) => c.get('adminEmail');
const flash = (c: Ctx) => c.req.query('msg') ?? null;

/** Only allow redirects back into the admin area. */
function safeReturn(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^\/admin(\/[A-Za-z0-9/_\-?=&.%]*)?$/.test(value) ? value : fallback;
}

/* ================================================================ dashboard */

adminRoutes.get('/admin', async (c) => {
  const db = c.env.DB;
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  const mode = countedMode(settings, version);
  const [progress, stats, recent] = await Promise.all([
    computeProgress(db, settings, mode),
    dashboardStats(db, mode),
    db
      .prepare('SELECT event, created_at, cf_country, detail FROM submission_log ORDER BY created_at DESC LIMIT 10')
      .all<{ event: string; created_at: string; cf_country: string | null; detail: string | null }>(),
  ]);
  return c.html(
    dashboardPage({
      email: admin(c),
      settings,
      progress,
      stats,
      version,
      recent: recent.results,
      emailOn: emailEnabled(c.env),
      flash: flash(c),
    }),
  );
});

/* ================================================================ signatures */

async function streetNames(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT DISTINCT street_name FROM households ORDER BY street_name COLLATE NOCASE')
    .all<{ street_name: string }>();
  return results.map((r) => r.street_name);
}

adminRoutes.get('/admin/signatures', async (c) => {
  const db = c.env.DB;
  const filters = parseSignatureFilters(c.req.query());
  const [{ rows, total }, streets] = await Promise.all([listSignatures(db, filters), streetNames(db)]);
  return c.html(signatureListPage({ email: admin(c), filters, rows, total, streets, flash: flash(c) }));
});

async function renderSignatureDetail(c: Ctx, sig: SignatureWithAddress, error?: string | null, status: 200 | 409 | 422 = 200) {
  const db = c.env.DB;
  const [household, version, logs, others] = await Promise.all([
    getHousehold(db, sig.household_id),
    getVersion(db, sig.petition_version_id),
    db
      .prepare(
        `SELECT event, created_at, ip_address, cf_country, detail FROM submission_log
         WHERE signature_id = ? OR (household_id = ? AND signature_id IS NULL)
         ORDER BY created_at DESC LIMIT 50`,
      )
      .bind(sig.id, sig.household_id)
      .all<{ event: string; created_at: string; ip_address: string | null; cf_country: string | null; detail: string | null }>(),
    db
      .prepare(
        `SELECT s.*, h.label AS household_label FROM signatures s JOIN households h ON h.id = s.household_id
         WHERE s.household_id = ? AND s.id != ? ORDER BY s.signed_at DESC`,
      )
      .bind(sig.household_id, sig.id)
      .all<SignatureWithAddress>(),
  ]);
  return c.html(
    signatureDetailPage({
      email: admin(c),
      sig,
      household,
      version,
      logs: logs.results,
      others: others.results,
      flash: flash(c),
      error,
    }),
    status,
  );
}

adminRoutes.get('/admin/signatures/:id', async (c) => {
  const sig = await getSignature(c.env.DB, c.req.param('id'));
  if (!sig) return c.notFound();
  return renderSignatureDetail(c, sig);
});

adminRoutes.post('/admin/signatures/:id/reject', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const sig = await getSignature(db, id);
  if (!sig) return c.notFound();
  const body = await c.req.parseBody();
  const reason = cleanString(body.reason, 500);
  if (!reason) return renderSignatureDetail(c, sig, 'A reason is required to reject a signature.', 422);
  if (sig.status !== 'active') return renderSignatureDetail(c, sig, 'Only active signatures can be rejected.', 409);
  await db.batch([
    db
      .prepare(`UPDATE signatures SET status = 'rejected', status_reason = ?, status_changed_at = ? WHERE id = ? AND status = 'active'`)
      .bind(reason, nowIso(), id),
    adminAuditStmt(db, admin(c), 'reject', id, { reason, household: sig.household_label }),
  ]);
  return c.redirect(`/admin/signatures/${id}?msg=rejected`, 303);
});

adminRoutes.post('/admin/signatures/:id/restore', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const sig = await getSignature(db, id);
  if (!sig) return c.notFound();
  if (sig.status === 'active') return c.redirect(`/admin/signatures/${id}`, 303);
  if (sig.full_name === '[withdrawn]')
    return renderSignatureDetail(c, sig, 'This withdrawn signature was already scrubbed by the retention job and cannot be restored.', 409);
  try {
    await db.batch([
      db
        .prepare(`UPDATE signatures SET status = 'active', status_reason = ?, status_changed_at = ? WHERE id = ?`)
        .bind(`restored by admin (was ${sig.status})`, nowIso(), id),
      adminAuditStmt(db, admin(c), 'restore', id, { previous_status: sig.status, household: sig.household_label }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err))
      return renderSignatureDetail(c, sig, 'This household already has another active signature in this mode. Reject or withdraw that one first.', 409);
    throw err;
  }
  return c.redirect(`/admin/signatures/${id}?msg=restored`, 303);
});

/* ================================================================ paper entry */

function emptyPaper(): PaperValues {
  const today = localDateStamp();
  return {
    household_id: '',
    full_name: '',
    relationship: '',
    signed_date: `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`,
    email: '',
    phone: '',
    note: '',
  };
}

async function paperHouseholds(db: D1Database, mode: SiteMode) {
  const area = await db.prepare('SELECT EXISTS(SELECT 1 FROM households WHERE in_petition_area = 1) AS d').first<{ d: number }>();
  const cond = area?.d ? 'active = 1 AND in_petition_area = 1' : mode === 'pledge' ? 'active = 1' : '0';
  const { results } = await db
    .prepare(
      `SELECT id, label, street_name FROM households WHERE ${cond}
       ORDER BY street_name COLLATE NOCASE, CAST(street_number AS INTEGER), unit`,
    )
    .all<{ id: string; label: string; street_name: string }>();
  return results;
}

async function renderPaper(
  c: Ctx,
  values: PaperValues,
  errors: Partial<Record<keyof PaperValues, string>> = {},
  error: string | null = null,
  status: 200 | 409 | 422 = 200,
) {
  const db = c.env.DB;
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  const canEnter = settings.site_mode !== 'closed' && !!version && version.mode === settings.site_mode;
  return c.html(
    paperEntryPage({
      email: admin(c),
      mode: settings.site_mode,
      households: canEnter ? await paperHouseholds(db, settings.site_mode) : [],
      values,
      errors,
      flash: flash(c),
      error,
      canEnter,
    }),
    status,
  );
}

adminRoutes.get('/admin/paper', (c) => renderPaper(c, emptyPaper()));

adminRoutes.post('/admin/paper', async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  const values: PaperValues = {
    household_id: cleanString(body.household_id, 64),
    full_name: cleanString(body.full_name, 200),
    relationship: cleanString(body.relationship, 20),
    signed_date: cleanString(body.signed_date, 20),
    email: normalizeEmail(cleanString(body.email, 300)),
    phone: cleanString(body.phone, 40),
    note: cleanString(body.note, 200),
  };
  if (settings.site_mode === 'closed' || !version || version.mode !== settings.site_mode)
    return renderPaper(c, values, {}, 'Paper entry is not available right now.', 409);
  const mode = settings.site_mode as Mode;
  const errors: Partial<Record<keyof PaperValues, string>> = {};
  const name = validateNameField(values.full_name);
  if (name.error) errors.full_name = name.error;
  if (!RELATIONSHIPS.some((r) => r.value === values.relationship)) errors.relationship = 'Choose a relationship.';
  const signedAt = localDateToIso(values.signed_date);
  if (!signedAt) errors.signed_date = 'Enter the date from the paper form.';
  else if (new Date(signedAt).getTime() > Date.now() + 24 * 3600 * 1000) errors.signed_date = 'The date cannot be in the future.';
  if (values.email && !isValidEmail(values.email)) errors.email = 'Enter a valid email or leave it blank.';
  const phone = normalizePhone(values.phone);
  if (phone === null) errors.phone = 'Enter a 10-digit US phone number or leave it blank.';
  const household = values.household_id ? await getEligibleHousehold(db, values.household_id, mode) : null;
  if (!household) errors.household_id = 'Choose an address in the petition area.';
  if (Object.keys(errors).length) return renderPaper(c, values, errors, null, 422);

  const flags = await computeFlags(db, {
    householdId: household!.id,
    email: values.email,
    fullName: name.value,
    ip: null,
    country: null,
  });
  const result = await insertSignature(db, {
    householdId: household!.id,
    versionId: version.id,
    mode,
    fullName: name.value,
    email: values.email,
    phone: phone || null,
    relationship: values.relationship as Relationship,
    typedSignature: '[signed on paper]',
    updatesOptIn: false,
    signedAt: signedAt!,
    meta: null,
    flags,
    entryMethod: 'paper',
    statusReason: `entered_by_admin: paper${values.note ? `; ${values.note}` : ''}`,
  });
  if (!result.ok)
    return renderPaper(c, values, { household_id: 'This household already has an active signature in this mode.' }, null, 409);
  await audit(db, admin(c), 'paper_entry', result.id, { household: household!.label, signed_date: values.signed_date, note: values.note || undefined });
  return c.redirect(`/admin/signatures/${result.id}?msg=paper`, 303);
});

/* ================================================================ households */

adminRoutes.get('/admin/households', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const filters: HouseholdFilters = {
    street: (q.street ?? '').slice(0, 100),
    area: q.area === '1' || q.area === '0' ? q.area : '',
    occupied: q.occupied === '1' || q.occupied === '0' ? q.occupied : '',
    active: q.active === '0' || q.active === 'all' ? q.active : '1',
    q: (q.q ?? '').trim().slice(0, 100),
  };
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filters.street) {
    where.push('h.street_name = ? COLLATE NOCASE');
    binds.push(filters.street);
  }
  if (filters.area) {
    where.push('h.in_petition_area = ?');
    binds.push(Number(filters.area));
  }
  if (filters.occupied) {
    where.push('h.occupied = ?');
    binds.push(Number(filters.occupied));
  }
  if (filters.active !== 'all') {
    where.push('h.active = ?');
    binds.push(Number(filters.active));
  }
  if (filters.q) {
    where.push("(h.label LIKE ? ESCAPE '\\' OR h.notes LIKE ? ESCAPE '\\')");
    const like = `%${filters.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    binds.push(like, like);
  }
  const { results } = await db
    .prepare(
      `SELECT h.*,
         (SELECT status FROM signatures s WHERE s.household_id = h.id AND s.mode = 'pledge' ORDER BY (s.status = 'active') DESC, s.signed_at DESC LIMIT 1) AS pledge_status,
         (SELECT status FROM signatures s WHERE s.household_id = h.id AND s.mode = 'petition' ORDER BY (s.status = 'active') DESC, s.signed_at DESC LIMIT 1) AS petition_status
       FROM households h ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY h.street_name COLLATE NOCASE, CAST(h.street_number AS INTEGER), h.street_number, h.unit
       LIMIT 2000`,
    )
    .bind(...binds)
    .all<HouseholdListRow>();
  return c.html(
    householdListPage({ email: admin(c), rows: results, filters, streets: await listStreets(db), flash: flash(c) }),
  );
});

adminRoutes.post('/admin/households/bulk-area', async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const street = cleanString(body.street_name, 100);
  const value = body.in_petition_area === '1' ? 1 : 0;
  if (!street) return c.redirect('/admin/households', 303);
  const res = await db
    .prepare('UPDATE households SET in_petition_area = ?, updated_at = ? WHERE street_name = ? COLLATE NOCASE AND in_petition_area != ?')
    .bind(value, nowIso(), street, value)
    .run();
  await audit(db, admin(c), 'bulk_area', street, { in_petition_area: value, changed: res.meta.changes });
  return c.redirect('/admin/households?msg=bulk', 303);
});

adminRoutes.get('/admin/households/import', (c) => c.html(importFormPage({ email: admin(c) })));

async function importText(body: Record<string, unknown>): Promise<string> {
  const file = body.file;
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) throw new Error('too_big');
    return file.text();
  }
  return typeof body.csv === 'string' ? body.csv : '';
}

adminRoutes.post('/admin/households/import', async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  let text: string;
  try {
    text = await importText(body);
  } catch {
    return c.html(importFormPage({ email: admin(c), error: 'The file is larger than 2 MB.' }), 422);
  }
  if (!text.trim()) return c.html(importFormPage({ email: admin(c), error: 'Choose a CSV file or paste CSV text.' }), 422);
  const parsed = parseImportCsv(text);
  if (!parsed.rows.length && parsed.errors.length && parsed.errors[0]?.line === 1)
    return c.html(importFormPage({ email: admin(c), error: parsed.errors.map((e) => e.message).join(' ') }), 422);
  const diff = await diffImport(db, parsed.rows);
  return c.html(
    importPreviewPage({ email: admin(c), diff: { ...diff, errors: parsed.errors }, csv: text, hash: await sha256Hex(text) }),
  );
});

adminRoutes.post('/admin/households/import/apply', async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const text = typeof body.csv === 'string' ? body.csv : '';
  if (!text || (await sha256Hex(text)) !== body.hash)
    return c.html(importFormPage({ email: admin(c), error: 'The import changed after the preview. Please upload it again.' }), 409);
  const parsed = parseImportCsv(text);
  const counts = await applyImport(db, parsed.rows, { deactivateMissing: body.deactivate_missing === '1', now: nowIso() });
  await audit(db, admin(c), 'import_households', null, { ...counts, skipped_rows: parsed.errors.length });
  return c.redirect('/admin/households?msg=imported', 303);
});

adminRoutes.get('/admin/households/:id', async (c) => {
  const h = await getHousehold(c.env.DB, c.req.param('id'));
  if (!h) return c.notFound();
  return c.html(householdEditPage({ email: admin(c), h, flash: flash(c) }));
});

adminRoutes.post('/admin/households/:id', async (c) => {
  const db = c.env.DB;
  const h = await getHousehold(db, c.req.param('id'));
  if (!h) return c.notFound();
  const body = await c.req.parseBody();
  const next: HouseholdRow = {
    ...h,
    street_number: cleanString(body.street_number, 20),
    street_name: cleanString(body.street_name, 100).replace(/\s+/g, ' '),
    unit: cleanString(body.unit, 20) || null,
    zip: cleanString(body.zip, 10),
    in_petition_area: body.in_petition_area === '1' ? 1 : 0,
    occupied: body.occupied === '1' ? 1 : 0,
    active: body.active === '1' ? 1 : 0,
    notes: cleanString(body.notes, 500) || null,
  };
  const problems: string[] = [];
  if (!/^\d+[A-Za-z]?(-\d+)?$/.test(next.street_number)) problems.push('House number is not valid.');
  if (!next.street_name) problems.push('Street is required.');
  if (!/^\d{5}(-\d{4})?$/.test(next.zip)) problems.push('ZIP must be 5 digits.');
  if (problems.length) return c.html(householdEditPage({ email: admin(c), h: next, error: problems.join(' ') }), 422);
  next.label = householdLabel(next.street_number, next.street_name, next.unit);
  next.normalized = normalizeHousehold(next.street_number, next.street_name, next.unit);
  const changed: Record<string, [unknown, unknown]> = {};
  for (const k of ['label', 'zip', 'in_petition_area', 'occupied', 'active', 'notes'] as const)
    if (h[k] !== next[k]) changed[k] = [h[k], next[k]];
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE households SET street_number = ?, street_name = ?, unit = ?, zip = ?, label = ?, normalized = ?,
             in_petition_area = ?, occupied = ?, active = ?, notes = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          next.street_number,
          next.street_name,
          next.unit,
          next.zip,
          next.label,
          next.normalized,
          next.in_petition_area,
          next.occupied,
          next.active,
          next.notes,
          nowIso(),
          h.id,
        ),
      adminAuditStmt(db, admin(c), 'edit_household', h.id, changed),
    ]);
  } catch (err) {
    if (isUniqueViolation(err))
      return c.html(householdEditPage({ email: admin(c), h: next, error: 'Another household already has this address.' }), 409);
    throw err;
  }
  return c.redirect(`/admin/households/${h.id}?msg=household_saved`, 303);
});

adminRoutes.post('/admin/households/:id/vacant', async (c) => {
  const db = c.env.DB;
  const h = await getHousehold(db, c.req.param('id'));
  if (!h) return c.notFound();
  const body = await c.req.parseBody();
  await db.batch([
    db.prepare('UPDATE households SET occupied = 0, updated_at = ? WHERE id = ?').bind(nowIso(), h.id),
    adminAuditStmt(db, admin(c), 'mark_vacant', h.id, { household: h.label }),
  ]);
  const back = safeReturn(body.return_to, `/admin/households/${h.id}`);
  return c.redirect(`${back}${back.includes('?') ? '&' : '?'}msg=vacant`, 303);
});

/* ================================================================ petition text */

adminRoutes.get('/admin/petition', async (c) => {
  const db = c.env.DB;
  const [versions, settings] = await Promise.all([listVersions(db), getSettings(db)]);
  return c.html(versionListPage({ email: admin(c), versions, siteMode: settings.site_mode, flash: flash(c) }));
});

adminRoutes.get('/admin/petition/new', async (c) => {
  const db = c.env.DB;
  const fromId = c.req.query('from');
  const base: PetitionVersion | null = fromId ? await getVersion(db, fromId) : await getActiveVersion(db);
  const values: VersionFormValues = {
    mode: base?.mode ?? 'petition',
    title: base?.title ?? '',
    body: base?.body_markdown ?? '',
    attestation: base?.attestation_text ?? 'I live at this address and am signing on behalf of my household.',
    source_note: '',
  };
  return c.html(versionFormPage({ email: admin(c), values }));
});

adminRoutes.post('/admin/petition', async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  // Keep the text exactly as typed (county wording must be verbatim), apart from line endings and control characters.
  const keep = (v: unknown, max: number) =>
    typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max) : '';
  const values: VersionFormValues = {
    mode: body.mode === 'pledge' ? 'pledge' : 'petition',
    title: keep(body.title, 200),
    body: keep(body.body, 20000),
    attestation: keep(body.attestation, 500),
    source_note: keep(body.source_note, 300),
  };
  if (!values.title || !values.body || !values.attestation)
    return c.html(versionFormPage({ email: admin(c), values, error: 'Title, text and attestation are all required.' }), 422);
  const id = await createDraftVersion(
    db,
    { mode: values.mode, title: values.title, body: values.body, attestation: values.attestation, sourceNote: values.source_note },
    nowIso(),
  );
  await audit(db, admin(c), 'create_version', id, { mode: values.mode, title: values.title });
  return c.redirect(`/admin/petition/${id}?msg=created`, 303);
});

adminRoutes.get('/admin/petition/:id', async (c) => {
  const db = c.env.DB;
  const v = await getVersion(db, c.req.param('id'));
  if (!v) return c.notFound();
  const [count, settings] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM signatures WHERE petition_version_id = ?').bind(v.id).first<{ n: number }>(),
    getSettings(db),
  ]);
  return c.html(versionDetailPage({ email: admin(c), v, signatureCount: count?.n ?? 0, siteMode: settings.site_mode, flash: flash(c) }));
});

adminRoutes.get('/admin/petition/:id/publish', async (c) => {
  const db = c.env.DB;
  const v = await getVersion(db, c.req.param('id'));
  if (!v) return c.notFound();
  if (v.active) return c.redirect(`/admin/petition/${v.id}`, 303);
  const [current, settings] = await Promise.all([getActiveVersion(db), getSettings(db)]);
  return c.html(publishConfirmPage({ email: admin(c), v, current, siteMode: settings.site_mode }));
});

adminRoutes.post('/admin/petition/:id/publish', async (c) => {
  const db = c.env.DB;
  const v = await getVersion(db, c.req.param('id'));
  if (!v) return c.notFound();
  const before = await getSettings(db);
  await publishVersion(db, v.id, nowIso());
  const after = await getSettings(db);
  await audit(db, admin(c), 'publish_version', v.id, {
    title: v.title,
    sha256: v.sha256,
    mode: v.mode,
    site_mode_before: before.site_mode,
    site_mode_after: after.site_mode,
  });
  return c.redirect(`/admin/petition/${v.id}?msg=published`, 303);
});

/* ================================================================ mode */

adminRoutes.get('/admin/mode', async (c) => {
  const db = c.env.DB;
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  return c.html(modePage({ email: admin(c), settings, version, flash: flash(c) }));
});

function modeProblem(to: SiteMode, version: PetitionVersion | null): string | null {
  if (to === 'closed') return null;
  if (!version || version.mode !== to)
    return `There is no active ${to} text. Publish a ${to} version under Petition text first; publishing switches the mode for you.`;
  return null;
}

function parseMode(v: unknown): SiteMode | null {
  return v === 'pledge' || v === 'petition' || v === 'closed' ? v : null;
}

adminRoutes.get('/admin/mode/confirm', async (c) => {
  const db = c.env.DB;
  const to = parseMode(c.req.query('to'));
  if (!to) return c.redirect('/admin/mode', 303);
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  if (to === settings.site_mode) return c.redirect('/admin/mode', 303);
  return c.html(modeConfirmPage({ email: admin(c), from: settings.site_mode, to, problem: modeProblem(to, version) }));
});

adminRoutes.post('/admin/mode', async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const to = parseMode(body.to);
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  if (!to) return c.redirect('/admin/mode', 303);
  const problem = modeProblem(to, version);
  if (problem) return c.html(modePage({ email: admin(c), settings, version, error: problem }), 409);
  await db.batch([
    setSettingStmt(db, 'site_mode', to),
    adminAuditStmt(db, admin(c), 'set_mode', to, { from: settings.site_mode, to }),
  ]);
  return c.redirect('/admin/mode?msg=mode', 303);
});

/* ================================================================ follow-ups */

adminRoutes.get('/admin/followups', async (c) => {
  const db = c.env.DB;
  const [rows, settings] = await Promise.all([pledgedNotSigned(db), getSettings(db)]);
  return c.html(
    followupsPage({
      email: admin(c),
      rows,
      siteMode: settings.site_mode,
      emailOn: emailEnabled(c.env),
      batchSize: FOLLOWUP_BATCH_SIZE,
      flash: flash(c),
      sentNote: c.req.query('sent') ? `Sent ${Number(c.req.query('sent')) || 0}, failed ${Number(c.req.query('failed')) || 0}.` : null,
    }),
  );
});

adminRoutes.post('/admin/followups/send', async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  if (settings.site_mode !== 'petition' || !emailEnabled(c.env)) return c.redirect('/admin/followups', 303);
  const rows = (await pledgedNotSigned(db)).filter((r) => r.updates_opt_in && !r.followup_sent_at && r.email);
  const batch = rows.slice(0, FOLLOWUP_BATCH_SIZE);
  let sent = 0;
  let failed = 0;
  for (const r of batch) {
    const unsubscribe = await unsubscribeToken(c.env.FORM_HMAC_KEY, r.signature_id);
    const res = await sendEmail(
      c.env,
      followupEmail(c.env, { to: r.email, name: r.full_name, signatureId: r.signature_id, unsubscribe, organizerName: settings.organizer_name }),
    );
    if (res.ok) {
      sent++;
      await db.prepare('UPDATE signatures SET followup_sent_at = ? WHERE id = ?').bind(nowIso(), r.signature_id).run();
    } else failed++;
  }
  await audit(db, admin(c), 'send_followups', null, { sent, failed, remaining: rows.length - sent });
  return c.redirect(`/admin/followups?msg=sent&sent=${sent}&failed=${failed}`, 303);
});

/* ================================================================ export & print */

adminRoutes.get('/admin/export', async (c) => {
  const settings = await getSettings(c.env.DB);
  return c.html(exportPage({ email: admin(c), siteMode: settings.site_mode }));
});

adminRoutes.get('/admin/export.csv', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const settings = await getSettings(db);
  const mode: Mode = q.mode === 'pledge' || q.mode === 'petition' ? q.mode : settings.site_mode === 'pledge' ? 'pledge' : 'petition';
  const status = ['active', 'withdrawn', 'rejected', 'all'].includes(q.status ?? '') ? q.status! : 'active';
  const includeIp = q.include_ip === '1';
  const { results } = await db
    .prepare(
      `SELECT h.label AS household_address, s.full_name, s.relationship, s.signed_at, s.typed_signature, s.email, s.phone,
              s.email_confirmed_at, s.entry_method, v.sha256 AS petition_version_sha256, s.status,
              s.ip_address, s.user_agent, s.cf_country
       FROM signatures s
       JOIN households h ON h.id = s.household_id
       JOIN petition_versions v ON v.id = s.petition_version_id
       WHERE s.mode = ? ${status === 'all' ? '' : 'AND s.status = ?'}
       ORDER BY h.street_name COLLATE NOCASE, CAST(h.street_number AS INTEGER), h.unit, s.signed_at`,
    )
    .bind(...(status === 'all' ? [mode] : [mode, status]))
    .all<Record<string, string | null>>();
  const header = [
    'household_address',
    'full_name',
    'relationship',
    'signed_at_local',
    'typed_signature',
    'email',
    'phone',
    'email_confirmed',
    'petition_version_sha256',
    'status',
    ...(includeIp ? ['ip_address', 'user_agent', 'cf_country'] : []),
  ];
  const rows = results.map((r) => [
    r.household_address,
    r.full_name,
    RELATIONSHIP_LABELS[r.relationship ?? ''] ?? r.relationship,
    r.signed_at ? formatLocalDateTime(r.signed_at) : '',
    r.typed_signature,
    r.email,
    r.phone,
    r.entry_method === 'paper' ? 'n/a (paper)' : r.email_confirmed_at ? 'yes' : 'no',
    r.petition_version_sha256,
    r.status,
    ...(includeIp ? [r.ip_address, r.user_agent, r.cf_country] : []),
  ]);
  await audit(db, admin(c), 'export_csv', mode, { status, include_ip: includeIp, rows: rows.length });
  return new Response(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="petition-${mode}-${localDateStamp()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

adminRoutes.get('/admin/print', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const mode: Mode = q.mode === 'pledge' ? 'pledge' : 'petition';
  const blank = q.blank === '1';
  const perPage = Math.min(40, Math.max(3, Number.parseInt(q.per_page ?? '12', 10) || 12));
  // Print under the requested version, else the active one if it matches, else the newest published one of this mode.
  let version: PetitionVersion | null = q.version ? await getVersion(db, q.version) : null;
  if (!version || version.mode !== mode) {
    const active = await getActiveVersion(db);
    version =
      active && active.mode === mode
        ? active
        : await db
            .prepare('SELECT * FROM petition_versions WHERE mode = ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 1')
            .bind(mode)
            .first<PetitionVersion>();
  }
  if (!version) return c.html(exportPage({ email: admin(c), siteMode: (await getSettings(db)).site_mode }), 404);

  let rows: PrintRow[];
  if (blank) {
    const { results } = await db
      .prepare(
        `SELECT h.label AS household_label FROM households h
         WHERE h.active = 1 AND h.in_petition_area = 1 AND h.occupied = 1
           AND NOT EXISTS (SELECT 1 FROM signatures s WHERE s.household_id = h.id AND s.mode = ? AND s.status = 'active')
         ORDER BY h.street_name COLLATE NOCASE, CAST(h.street_number AS INTEGER), h.unit`,
      )
      .bind(mode)
      .all<{ household_label: string }>();
    rows = results.map((r) => ({
      household_label: r.household_label,
      full_name: null,
      typed_signature: null,
      relationship: null,
      signed_at: null,
      entry_method: null,
      petition_version_sha256: null,
    }));
  } else {
    const { results } = await db
      .prepare(
        `SELECT h.label AS household_label, s.full_name, s.typed_signature, s.relationship, s.signed_at, s.entry_method,
                v.sha256 AS petition_version_sha256
         FROM signatures s JOIN households h ON h.id = s.household_id JOIN petition_versions v ON v.id = s.petition_version_id
         WHERE s.mode = ? AND s.status = 'active' AND s.petition_version_id = ?
         ORDER BY h.street_name COLLATE NOCASE, CAST(h.street_number AS INTEGER), h.unit`,
      )
      .bind(mode, version.id)
      .all<PrintRow>();
    rows = results;
  }
  await audit(db, admin(c), 'print', mode, { blank, version: version.sha256.slice(0, 12), rows: rows.length });
  return c.html(printPage({ version, rows, perPage, blank, generatedAt: nowIso() }));
});

/* ================================================================ settings */

adminRoutes.get('/admin/settings', async (c) => {
  const settings = await getSettings(c.env.DB);
  return c.html(settingsPage({ email: admin(c), settings, flash: flash(c) }));
});

adminRoutes.post('/admin/settings', async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const before = await getSettings(db);
  const v = (k: string, max = 300) => cleanString(body[k], max);
  const next: Record<string, string> = {
    organizer_name: v('organizer_name', 100),
    organizer_email: normalizeEmail(v('organizer_email', 254)),
    organizer_phone: v('organizer_phone', 30),
    co_organizers: v('co_organizers', 200),
    goal_percent: v('goal_percent', 3),
    occupied_override: v('occupied_override', 6),
    retention_days_ip: v('retention_days_ip', 5),
    retention_days_all: v('retention_days_all', 5),
    require_email_confirmation: body.require_email_confirmation === 'true' ? 'true' : 'false',
    final_decision_date: v('final_decision_date', 10),
    privacy_updated: v('privacy_updated', 10),
  };
  const problems: string[] = [];
  const int = (k: string, min: number, max: number, optional = false) => {
    if (optional && next[k] === '') return;
    const n = Number(next[k]);
    if (!Number.isInteger(n) || n < min || n > max) problems.push(`${k.replace(/_/g, ' ')} must be a whole number from ${min} to ${max}.`);
  };
  if (!next.organizer_name) problems.push('Organizer name is required.');
  if (next.organizer_email && !isValidEmail(next.organizer_email!)) problems.push('Organizer email is not valid.');
  int('goal_percent', 1, 100);
  int('occupied_override', 1, 100000, true);
  int('retention_days_ip', 1, 3650);
  int('retention_days_all', 1, 3650);
  if (next.final_decision_date && !localDateToIso(next.final_decision_date!)) problems.push('Final decision date is not a valid date.');
  if (!localDateToIso(next.privacy_updated!)) problems.push('Privacy “last updated” must be a date.');
  if (problems.length)
    return c.html(settingsPage({ email: admin(c), settings: { ...before }, error: problems.join(' ') }), 422);

  const beforeMap = before as unknown as Record<string, unknown>;
  const changed: Record<string, [string, string]> = {};
  for (const k of EDITABLE_SETTING_KEYS) {
    const old = beforeMap[k] === null || beforeMap[k] === undefined ? '' : String(beforeMap[k]);
    if (old !== next[k]) changed[k] = [old, next[k]!];
  }
  await db.batch([
    ...EDITABLE_SETTING_KEYS.map((k) => setSettingStmt(db, k, next[k]!)),
    adminAuditStmt(db, admin(c), 'update_settings', null, changed),
  ]);
  return c.redirect('/admin/settings?msg=saved', 303);
});

adminRoutes.post('/admin/retention/run', async (c) => {
  await runRetention(c.env.DB, new Date(), { actor: admin(c) });
  return c.redirect('/admin/settings?msg=purged', 303);
});

/* ================================================================ audit */

const LOG_EVENTS = [
  'sign_ok',
  'duplicate_household',
  'invalid_address',
  'turnstile_fail',
  'rate_limited',
  'too_fast',
  'form_expired',
  'version_mismatch',
  'validation_error',
  'closed',
  'honeypot',
  'withdraw',
  'confirm_email',
  'unsubscribe',
];

adminRoutes.get('/admin/audit', async (c) => {
  const db = c.env.DB;
  const event = LOG_EVENTS.includes(c.req.query('event') ?? '') ? c.req.query('event')! : '';
  const [auditRows, logs] = await db.batch([
    db.prepare('SELECT admin_email, action, target, detail, created_at FROM admin_audit ORDER BY created_at DESC LIMIT 200'),
    event
      ? db
          .prepare('SELECT event, signature_id, ip_address, cf_country, detail, created_at FROM submission_log WHERE event = ? ORDER BY created_at DESC LIMIT 200')
          .bind(event)
      : db.prepare('SELECT event, signature_id, ip_address, cf_country, detail, created_at FROM submission_log ORDER BY created_at DESC LIMIT 200'),
  ]);
  return c.html(
    auditPage({
      email: admin(c),
      audit: (auditRows?.results ?? []) as never[],
      logs: (logs?.results ?? []) as never[],
      event,
      events: LOG_EVENTS,
    }),
  );
});

/* ================================================================ JSON for admin tools */

adminRoutes.get('/api/admin/progress', async (c) => {
  const db = c.env.DB;
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  const mode = countedMode(settings, version);
  const [progress, stats] = await Promise.all([computeProgress(db, settings, mode), dashboardStats(db, mode)]);
  return c.json({ progress, stats });
});
