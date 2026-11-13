import { Hono, type Context } from 'hono';
import type { AppBindings, Mode } from '../env';
import { getEligibleHousehold, listEligibleByStreet, searchHouseholds } from '../lib/address';
import { checkFormToken, checkUnsubscribeToken, issueFormToken } from '../lib/crypto';
import { confirmationEmail, emailEnabled, sendEmail } from '../lib/email';
import { logSubmission, requestMeta } from '../lib/log';
import { getActiveVersion, type PetitionVersion } from '../lib/petition';
import { computeProgress } from '../lib/progress';
import { isSameOrigin } from '../lib/security';
import { getSettings, type Settings } from '../lib/settings';
import { computeFlags, findByToken, getSignature, insertSignature, type SignatureWithAddress } from '../lib/signatures';
import { nowIso } from '../lib/time';
import { verifyTurnstile } from '../lib/turnstile';
import {
  cleanSource,
  cleanString,
  emptySignValues,
  validateSignForm,
  type FieldErrors,
  type Relationship,
  type SignFormValues,
} from '../lib/validate';
import { homePage } from '../views/public/home';
import {
  confirmPage,
  errorPage,
  faqPage,
  invalidLinkPage,
  privacyPage,
  thanksPage,
  unsubscribePage,
  withdrawPage,
} from '../views/public/pages';
import { signFormPage, signUnavailablePage } from '../views/public/sign';

type Ctx = Context<AppBindings>;

export const publicRoutes = new Hono<AppBindings>();

/** The mode whose signatures the public progress counts. */
export function countedMode(settings: Settings, version: PetitionVersion | null): Mode {
  if (settings.site_mode === 'pledge' || settings.site_mode === 'petition') return settings.site_mode;
  return version?.mode ?? 'pledge';
}

function signingOpen(settings: Settings, version: PetitionVersion | null): version is PetitionVersion {
  return settings.site_mode !== 'closed' && !!version && version.mode === settings.site_mode;
}

export const DUPLICATE_MESSAGE =
  'Someone at this address has already signed. The county counts one signature per household. If you believe this is a mistake, contact the organizer.';
export const NOT_IN_AREA_MESSAGE =
  "This address isn't in the petition area. If you think that's wrong, contact the organizer.";
export const VERSION_MISMATCH_MESSAGE = 'The petition text was updated, please review and sign again.';
export const TURNSTILE_MESSAGE =
  'Please complete the check (the “Verify you are human” box) and submit again. Having trouble? Contact the organizer and we’ll help you sign on paper.';

/* ------------------------------------------------------------------ pages */

publicRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  const progress = await computeProgress(db, settings, countedMode(settings, version));
  return c.html(
    homePage({ settings, progress, src: cleanSource(c.req.query('src')), canSign: signingOpen(settings, version) }),
  );
});

async function renderSignForm(
  c: Ctx,
  status: 200 | 400 | 409 | 422,
  opts: {
    settings: Settings;
    version: PetitionVersion | null;
    values?: SignFormValues;
    errors?: FieldErrors;
    notice?: string | null;
    src: string | null;
  },
) {
  const { settings, version } = opts;
  c.header('Cache-Control', 'no-store');
  if (settings.site_mode === 'closed') return c.html(signUnavailablePage(settings, 'closed'), status === 200 ? 200 : 409);
  if (!signingOpen(settings, version)) return c.html(signUnavailablePage(settings, 'no_version'), status === 200 ? 200 : 409);
  const groups = await listEligibleByStreet(c.env.DB, settings.site_mode);
  if (!groups.length && settings.site_mode === 'petition')
    return c.html(signUnavailablePage(settings, 'no_area'), status === 200 ? 200 : 409);
  return c.html(
    signFormPage({
      settings,
      version,
      groups,
      values: opts.values ?? emptySignValues(),
      errors: opts.errors ?? {},
      notice: opts.notice,
      formToken: await issueFormToken(c.env.FORM_HMAC_KEY),
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
      src: opts.src,
    }),
    status,
  );
}

publicRoutes.get('/sign', async (c) => {
  const db = c.env.DB;
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  return renderSignForm(c, 200, { settings, version, src: cleanSource(c.req.query('src')) });
});

publicRoutes.post('/sign', async (c) => {
  const db = c.env.DB;
  const req = c.req.raw;
  const meta = requestMeta(req);

  // 1. Rate limit by IP.
  if (c.env.SUBMIT_LIMITER) {
    const { success } = await c.env.SUBMIT_LIMITER.limit({ key: `sign:${meta.ip ?? 'unknown'}` });
    if (!success) {
      await logSubmission(db, 'rate_limited', meta, { detail: { route: 'sign' } });
      const settings = await getSettings(db);
      c.header('Retry-After', '60');
      return c.html(
        errorPage(settings, 429, 'Please wait a minute', 'Too many attempts from your connection. Please wait a minute and try again.'),
        429,
      );
    }
  }
  // 2. Origin / Referer must be this site.
  if (!isSameOrigin(req)) {
    const settings = await getSettings(db);
    return c.html(
      errorPage(settings, 403, 'Request blocked', 'This form must be sent from this website. Please go back, reload the page and try again.'),
      403,
    );
  }

  const body = (await c.req.parseBody()) as Record<string, unknown>;
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  const src = cleanSource(body.src);
  const { values, errors } = validateSignForm(body);

  // Honeypot (spec §8): silently "succeed", store nothing.
  if (cleanString(body.website)) {
    await logSubmission(db, 'honeypot', meta);
    return c.redirect(`/thanks?mode=${version?.mode ?? 'pledge'}`, 303);
  }

  // 3. Turnstile.
  const ts = await verifyTurnstile({
    secret: c.env.TURNSTILE_SECRET_KEY,
    token: typeof body['cf-turnstile-response'] === 'string' ? body['cf-turnstile-response'] : undefined,
    remoteIp: meta.ip,
    expectedHostname: new URL(req.url).hostname,
  });
  if (!ts.ok) {
    await logSubmission(db, 'turnstile_fail', meta, { detail: { codes: ts.codes.slice(0, 5) } });
    return renderSignForm(c, 400, { settings, version, values, notice: TURNSTILE_MESSAGE, src });
  }

  // 4. Minimum fill time and form age.
  const ft = await checkFormToken(c.env.FORM_HMAC_KEY, typeof body.form_started_at === 'string' ? body.form_started_at : undefined);
  if (!ft.ok) {
    await logSubmission(db, ft.reason === 'too_fast' ? 'too_fast' : 'form_expired', meta, { detail: { reason: ft.reason } });
    const notice =
      ft.reason === 'too_fast'
        ? 'That was very fast. Please check your details and submit again.'
        : 'This form was open for a long time and has expired. Please check your details and submit again.';
    return renderSignForm(c, 400, { settings, version, values, notice, src });
  }

  // 5. Petition version must be the active one.
  if (!version || body.petition_version_id !== version.id) {
    await logSubmission(db, 'version_mismatch', meta, {
      detail: { submitted: cleanString(body.petition_version_id, 64), active: version?.id ?? null },
    });
    return renderSignForm(c, 409, { settings, version, values, notice: VERSION_MISMATCH_MESSAGE, src });
  }

  // 6. Not closed (and the active text matches the site mode).
  if (!signingOpen(settings, version)) {
    await logSubmission(db, 'closed', meta);
    return renderSignForm(c, 409, { settings, version, src });
  }
  const mode = settings.site_mode as Mode;

  // 7. Field validation.
  if (Object.keys(errors).length) {
    await logSubmission(db, 'validation_error', meta, { detail: { fields: Object.keys(errors) } });
    return renderSignForm(c, 422, { settings, version, values, errors, src });
  }

  // 8. Household must exist, be active and be in the petition area.
  const household = await getEligibleHousehold(db, values.household_id, mode);
  if (!household) {
    await logSubmission(db, 'invalid_address', meta, { detail: { household_id: values.household_id.slice(0, 64) } });
    return renderSignForm(c, 422, {
      settings,
      version,
      values: { ...values, household_id: '' },
      errors: { household_id: NOT_IN_AREA_MESSAGE },
      src,
    });
  }

  // 10. Soft review flags (computed before the insert; never blocking).
  const flags = await computeFlags(db, {
    householdId: household.id,
    email: values.email,
    fullName: values.full_name,
    ip: meta.ip,
    country: meta.country,
  });

  // 9. Single INSERT guarded by the partial unique index.
  const signedAt = nowIso();
  const result = await insertSignature(db, {
    householdId: household.id,
    versionId: version.id,
    mode,
    fullName: values.full_name,
    email: values.email,
    phone: values.phone || null,
    relationship: values.relationship as Relationship,
    typedSignature: values.typed_signature,
    updatesOptIn: values.updates_opt_in,
    signedAt,
    meta,
    flags,
    entryMethod: 'online',
  });
  if (!result.ok) {
    await logSubmission(db, 'duplicate_household', meta, { householdId: household.id });
    return renderSignForm(c, 409, {
      settings,
      version,
      values,
      errors: { household_id: DUPLICATE_MESSAGE },
      src,
    });
  }

  // 11. Log success.
  await logSubmission(db, 'sign_ok', meta, {
    signatureId: result.id,
    householdId: household.id,
    detail: { ...(src ? { src } : {}), ...(flags.length ? { flags } : {}), mode },
  });

  // 12. Confirmation email, off the response path.
  if (emailEnabled(c.env)) {
    c.executionCtx.waitUntil(
      sendEmail(
        c.env,
        confirmationEmail(c.env, {
          to: values.email,
          name: values.full_name,
          address: household.label,
          signedAt,
          mode,
          token: result.token,
          organizerName: settings.organizer_name,
        }),
      ),
    );
  }

  return c.redirect(`/thanks?mode=${mode}`, 303);
});

publicRoutes.get('/thanks', async (c) => {
  const settings = await getSettings(c.env.DB);
  const q = c.req.query('mode');
  const mode: Mode = q === 'pledge' || q === 'petition' ? q : settings.site_mode === 'petition' ? 'petition' : 'pledge';
  c.header('Cache-Control', 'no-store');
  return c.html(thanksPage(settings, mode, emailEnabled(c.env)));
});

publicRoutes.get('/confirm', async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  c.header('Cache-Control', 'no-store');
  const sig = await findByToken(db, c.req.query('token'));
  if (!sig || (sig.status === 'withdrawn' && sig.full_name === '[withdrawn]')) return c.html(invalidLinkPage(settings), 404);
  if (!sig.email_confirmed_at) {
    await db.prepare('UPDATE signatures SET email_confirmed_at = ? WHERE id = ? AND email_confirmed_at IS NULL').bind(nowIso(), sig.id).run();
    await logSubmission(db, 'confirm_email', requestMeta(c.req.raw), { signatureId: sig.id, householdId: sig.household_id });
  }
  return c.html(confirmPage(settings, true));
});

publicRoutes.get('/withdraw', async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  c.header('Cache-Control', 'no-store');
  const token = c.req.query('token');
  const sig = await findByToken(db, token);
  if (!sig || !token) return c.html(invalidLinkPage(settings), 404);
  return c.html(withdrawPage(settings, sig, token));
});

publicRoutes.post('/withdraw', async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  c.header('Cache-Control', 'no-store');
  const body = await c.req.parseBody();
  const token = typeof body.token === 'string' ? body.token : '';
  const sig = await findByToken(db, token);
  if (!sig) return c.html(invalidLinkPage(settings), 404);
  if (sig.status !== 'active') return c.html(withdrawPage(settings, sig, token));
  const now = nowIso();
  await db
    .prepare(
      `UPDATE signatures SET status = 'withdrawn', status_reason = 'withdrawn by signer', status_changed_at = ?
       WHERE id = ? AND status = 'active'`,
    )
    .bind(now, sig.id)
    .run();
  await logSubmission(db, 'withdraw', requestMeta(c.req.raw), { signatureId: sig.id, householdId: sig.household_id });
  return c.html(withdrawPage(settings, { ...sig, status: 'withdrawn', status_changed_at: now }, token, true));
});

/** Unsubscribe links carry the signature id plus an HMAC (see unsubscribeToken). */
async function unsubscribeTarget(c: Ctx, sid: unknown, sig: unknown): Promise<SignatureWithAddress | null> {
  if (typeof sid !== 'string' || typeof sig !== 'string' || !/^[0-9a-f-]{36}$/.test(sid) || sig.length > 100) return null;
  if (!(await checkUnsubscribeToken(c.env.FORM_HMAC_KEY, sid, sig))) return null;
  return getSignature(c.env.DB, sid);
}

publicRoutes.get('/unsubscribe', async (c) => {
  const settings = await getSettings(c.env.DB);
  c.header('Cache-Control', 'no-store');
  const sid = c.req.query('sid') ?? '';
  const sig = c.req.query('sig') ?? '';
  const row = await unsubscribeTarget(c, sid, sig);
  if (!row) return c.html(invalidLinkPage(settings), 404);
  return c.html(unsubscribePage(settings, sid, sig, row.updates_opt_in ? 'ask' : 'done'));
});

publicRoutes.post('/unsubscribe', async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  c.header('Cache-Control', 'no-store');
  const body = await c.req.parseBody();
  const row = await unsubscribeTarget(c, body.sid, body.sig);
  if (!row) return c.html(invalidLinkPage(settings), 404);
  // One opt-out covers every signature made with this email address.
  await db
    .prepare("UPDATE signatures SET updates_opt_in = 0 WHERE id = ? OR (email = ? AND email != '')")
    .bind(row.id, row.email)
    .run();
  await logSubmission(db, 'unsubscribe', requestMeta(c.req.raw), { signatureId: row.id, householdId: row.household_id });
  return c.html(unsubscribePage(settings, String(body.sid), String(body.sig), 'done'));
});

publicRoutes.get('/privacy', async (c) => c.html(privacyPage(await getSettings(c.env.DB))));
publicRoutes.get('/faq', async (c) => c.html(faqPage(await getSettings(c.env.DB))));

/* ------------------------------------------------------------------ JSON API */

publicRoutes.get('/api/address-search', async (c) => {
  const meta = requestMeta(c.req.raw);
  if (c.env.SEARCH_LIMITER) {
    const { success } = await c.env.SEARCH_LIMITER.limit({ key: `search:${meta.ip ?? 'unknown'}` });
    if (!success) {
      c.header('Retry-After', '60');
      return c.json({ error: 'rate_limited' }, 429);
    }
  }
  const q = cleanString(c.req.query('q'), 100);
  if (q.length < 2) return c.json({ error: 'query_too_short', min: 2 }, 400);
  const settings = await getSettings(c.env.DB);
  // Only households from the address list are returned. Signing status is never included.
  const results = await searchHouseholds(c.env.DB, q, settings.site_mode, 10);
  c.header('Cache-Control', 'private, max-age=60');
  return c.json(results);
});

publicRoutes.get('/api/progress', async (c) => {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheKey = new Request(new URL('/api/progress', c.req.url).toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const db = c.env.DB;
  const [settings, version] = await Promise.all([getSettings(db), getActiveVersion(db)]);
  const p = await computeProgress(db, settings, countedMode(settings, version));
  const res = new Response(
    JSON.stringify({
      signed: p.signed,
      occupied_total: p.occupied_total,
      percent: p.percent,
      goal_percent: p.goal_percent,
      mode: p.mode,
      updated_at: p.updated_at,
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } },
  );
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
});
