import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUPLICATE_MESSAGE, NOT_IN_AREA_MESSAGE, TURNSTILE_MESSAGE, VERSION_MISMATCH_MESSAGE } from '../src/routes/public';
import { escapeHtml } from '../src/lib/markdown';
import { createDraftVersion, publishVersion } from '../src/lib/petition';
import {
  addHousehold,
  blockedLimiter,
  call,
  countLogs,
  db,
  DEFAULT_IP,
  get,
  lastLog,
  oldFormToken,
  postForm,
  resetDb,
  setSetting,
  signBody,
  stubFetch,
  testEnv,
} from './helpers';

const esc = (s: string) => escapeHtml(s);

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function signatureCount(): Promise<number> {
  const r = await db().prepare('SELECT COUNT(*) AS n FROM signatures').first<{ n: number }>();
  return r?.n ?? 0;
}

describe('GET /sign', () => {
  it('renders the form with the active text, a form token and no-store', async () => {
    await addHousehold();
    const res = await call(get('/sign'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('name="form_started_at"');
    expect(html).toContain('name="petition_version_id" value="00000000-0000-4000-8000-000000000001"');
    expect(html).toContain('Pledge of support');
    expect(html).toContain(esc('I live at this address and am signing on behalf of my household.'));
    expect(html).toContain('name="website"');
    expect(html).toContain('/privacy');
    // No-JS fallback: a <select> grouped by street
    expect(html).toMatch(/<optgroup label="Victory Lakes Loop">/);
  });

  it('shows closed when the site is closed', async () => {
    await setSetting('site_mode', 'closed');
    const res = await call(get('/sign'));
    expect(await res.text()).toContain('Signatures are closed');
  });
});

describe('POST /sign happy path', () => {
  it('stores the signature with the submission snapshot and redirects to /thanks', async () => {
    const { calls } = stubFetch();
    const h = await addHousehold();
    const res = await call(
      postForm('/sign', await signBody(h.id, { phone: '(703) 555-0100', updates_opt_in: '1', src: 'mailer' }), {
        headers: { 'CF-Connecting-IP': '198.51.100.7', 'User-Agent': 'UA-Test/1.0' },
        cf: { country: 'US', asn: 7922 },
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/thanks?mode=pledge');
    const s = await db().prepare('SELECT * FROM signatures WHERE household_id = ?').bind(h.id).first<Record<string, unknown>>();
    expect(s).toMatchObject({
      mode: 'pledge',
      full_name: 'Jane Q. Neighbor',
      email: 'jane@example.com',
      phone: '7035550100',
      relationship: 'owner',
      status: 'active',
      ip_address: '198.51.100.7',
      user_agent: 'UA-Test/1.0',
      cf_country: 'US',
      cf_asn: 7922,
      updates_opt_in: 1,
      entry_method: 'online',
      petition_version_id: '00000000-0000-4000-8000-000000000001',
    });
    expect(Date.now() - new Date(s!.signed_at as string).getTime()).toBeLessThan(60_000);
    expect(s!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const log = await lastLog('sign_ok');
    expect(log?.signature_id).toBe(s!.id);
    expect(JSON.parse(log!.detail!)).toMatchObject({ src: 'mailer', mode: 'pledge' });
    // Turnstile verified with the client IP; confirmation email sent with confirm + withdraw links
    const verify = calls.find((c) => c.url.includes('siteverify'))!;
    expect(JSON.parse(verify.body)).toMatchObject({ secret: 'test-turnstile-secret', response: 'test-token', remoteip: '198.51.100.7' });
    const mail = calls.find((c) => c.url.startsWith('https://api.resend.com/'))!;
    expect(mail.body).toContain('/confirm?token=');
    expect(mail.body).toContain('/withdraw?token=');
    expect(mail.body).toContain('jane@example.com');
  });

  it('sends no email when EMAIL_ENABLED is false, and survives a provider failure', async () => {
    const off = stubFetch();
    const h1 = await addHousehold();
    expect((await call(postForm('/sign', await signBody(h1.id)), testEnv({ EMAIL_ENABLED: 'false' }))).status).toBe(303);
    expect(off.calls.some((c) => c.url.startsWith('https://api.resend.com/'))).toBe(false);
    vi.restoreAllMocks();
    const failing = stubFetch({ email: 500 });
    const h2 = await addHousehold();
    expect((await call(postForm('/sign', await signBody(h2.id)))).status).toBe(303);
    expect(failing.calls.some((c) => c.url.startsWith('https://api.resend.com/'))).toBe(true);
  });

  it('flags non-US submissions, shared IPs, reused emails and names without blocking', async () => {
    stubFetch();
    const ip = '192.0.2.99';
    for (let i = 0; i < 3; i++) {
      const h = await addHousehold();
      const r = await call(postForm('/sign', await signBody(h.id, { full_name: `Person Number${'abc'[i]}`, typed_signature: `Person Number${'abc'[i]}`, email: `p${i}@example.com` }), { headers: { 'CF-Connecting-IP': ip } }));
      expect(r.status).toBe(303);
    }
    const h4 = await addHousehold();
    const res = await call(
      postForm('/sign', await signBody(h4.id, { full_name: 'Person Numbera', typed_signature: 'person numbera', email: 'p0@example.com' }), {
        headers: { 'CF-Connecting-IP': ip },
        cf: { country: 'CA', asn: 1 },
      }),
    );
    expect(res.status).toBe(303);
    const row = await db().prepare('SELECT flags FROM signatures WHERE household_id = ?').bind(h4.id).first<{ flags: string }>();
    expect(JSON.parse(row!.flags).sort()).toEqual(['email_reused', 'name_reused', 'non_us', 'shared_ip']);
  });
});

describe('POST /sign checks (spec §6 order)', () => {
  it('1. rate limit returns 429 and logs rate_limited before anything else', async () => {
    const { calls } = stubFetch();
    const h = await addHousehold();
    const res = await call(postForm('/sign', await signBody(h.id), { origin: 'https://evil.example' }), testEnv({ SUBMIT_LIMITER: blockedLimiter }));
    expect(res.status).toBe(429);
    expect(await countLogs('rate_limited')).toBe(1);
    expect(calls.length).toBe(0);
    expect(await signatureCount()).toBe(0);
  });

  it('2. foreign or missing Origin/Referer is refused with 403', async () => {
    stubFetch();
    const h = await addHousehold();
    expect((await call(postForm('/sign', await signBody(h.id), { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await call(postForm('/sign', await signBody(h.id), { origin: null }))).status).toBe(403);
    // Referer from this site is accepted when Origin is absent
    const ok = await call(postForm('/sign', await signBody(h.id), { origin: null, headers: { Referer: 'https://petition.test/sign' } }));
    expect(ok.status).toBe(303);
  });

  it('3. Turnstile failure re-renders with values kept and logs turnstile_fail', async () => {
    stubFetch({ turnstile: false });
    const h = await addHousehold();
    const res = await call(postForm('/sign', await signBody(h.id, { email: 'keepme@example.com' })));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain(esc(TURNSTILE_MESSAGE));
    expect(html).toContain('value="keepme@example.com"');
    expect(html).toContain('help you sign on paper');
    expect(await countLogs('turnstile_fail')).toBe(1);
    expect(await signatureCount()).toBe(0);
  });

  it('3. Turnstile hostname or action mismatch fails', async () => {
    const h = await addHousehold();
    stubFetch({ turnstile: { success: true, hostname: 'other.example', action: 'sign' } });
    expect((await call(postForm('/sign', await signBody(h.id)))).status).toBe(400);
    vi.restoreAllMocks();
    stubFetch({ turnstile: { success: true, hostname: 'petition.test', action: 'login' } });
    expect((await call(postForm('/sign', await signBody(h.id)))).status).toBe(400);
    expect(await countLogs('turnstile_fail')).toBe(2);
  });

  it('3. missing Turnstile token fails without calling siteverify', async () => {
    const { calls } = stubFetch();
    const h = await addHousehold();
    const body = await signBody(h.id);
    delete body['cf-turnstile-response'];
    expect((await call(postForm('/sign', body))).status).toBe(400);
    expect(calls.filter((c) => c.url.includes('siteverify')).length).toBe(0);
  });

  it('honeypot: silently shows thanks, stores nothing, logs honeypot', async () => {
    stubFetch();
    const h = await addHousehold();
    const res = await call(postForm('/sign', await signBody(h.id, { website: 'http://spam.example' })));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toMatch(/^\/thanks/);
    expect(await signatureCount()).toBe(0);
    expect(await countLogs('honeypot')).toBe(1);
  });

  it('4. too-fast submission (< 3 s) is refused and logged too_fast', async () => {
    stubFetch();
    const h = await addHousehold();
    const res = await call(postForm('/sign', await signBody(h.id, { form_started_at: await oldFormToken(500) })));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('very fast');
    expect(await countLogs('too_fast')).toBe(1);
    expect(await signatureCount()).toBe(0);
  });

  it('4. expired (> 2 h) or forged form token is refused', async () => {
    stubFetch();
    const h = await addHousehold();
    const expired = await call(postForm('/sign', await signBody(h.id, { form_started_at: await oldFormToken(3 * 60 * 60 * 1000) })));
    expect(expired.status).toBe(400);
    const forged = await call(postForm('/sign', await signBody(h.id, { form_started_at: `v1.${Date.now() - 10000}.AAAA` })));
    expect(forged.status).toBe(400);
    expect(await countLogs('form_expired')).toBe(2);
    expect(await signatureCount()).toBe(0);
  });

  it('5. a stale petition_version_id is refused after a new version is published', async () => {
    stubFetch();
    const h = await addHousehold();
    const body = await signBody(h.id); // carries the seeded version id
    const id = await createDraftVersion(db(), { mode: 'pledge', title: 'Updated pledge', body: 'New words.', attestation: 'I live here.', sourceNote: '' }, new Date().toISOString());
    await publishVersion(db(), id, new Date().toISOString());
    const res = await call(postForm('/sign', body));
    expect(res.status).toBe(409);
    const html = await res.text();
    expect(html).toContain(esc(VERSION_MISMATCH_MESSAGE));
    expect(html).toContain('Updated pledge');
    expect(html).toContain(`value="${id}"`);
    expect(await countLogs('version_mismatch')).toBe(1);
    expect(await signatureCount()).toBe(0);
  });

  it('6. closed site refuses signatures', async () => {
    stubFetch();
    const h = await addHousehold();
    const body = await signBody(h.id);
    await setSetting('site_mode', 'closed');
    const res = await call(postForm('/sign', body));
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('Signatures are closed');
    expect(await countLogs('closed')).toBe(1);
    expect(await signatureCount()).toBe(0);
  });

  it('7. field validation errors re-render with aria links and preserved values', async () => {
    stubFetch();
    const h = await addHousehold();
    const res = await call(postForm('/sign', await signBody(h.id, { typed_signature: 'Not The Same', email: 'bad', full_name: 'Jane Q. Neighbor' })));
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain('id="error-summary"');
    expect(html).toContain('href="#email"');
    expect(html).toContain('aria-describedby="typed_signature-hint typed_signature-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('value="Jane Q. Neighbor"');
    expect(await countLogs('validation_error')).toBe(1);
  });

  it('8. a crafted POST for an unknown household is rejected', async () => {
    stubFetch();
    await addHousehold();
    const res = await call(postForm('/sign', await signBody(crypto.randomUUID())));
    expect(res.status).toBe(422);
    expect(await res.text()).toContain(esc(NOT_IN_AREA_MESSAGE));
    expect(await countLogs('invalid_address')).toBe(1);
    expect(await signatureCount()).toBe(0);
  });

  it('8. an out-of-area or inactive household is rejected once the area is defined', async () => {
    stubFetch();
    await addHousehold({ inArea: 1 });
    const out = await addHousehold({ inArea: 0 });
    const inactive = await addHousehold({ inArea: 1, active: 0 });
    expect((await call(postForm('/sign', await signBody(out.id)))).status).toBe(422);
    expect((await call(postForm('/sign', await signBody(inactive.id)))).status).toBe(422);
    expect(await countLogs('invalid_address')).toBe(2);
  });

  it('8. pledge exception: any active household may pledge while no area is defined', async () => {
    stubFetch();
    const h = await addHousehold({ inArea: 0 });
    const res = await call(postForm('/sign', await signBody(h.id)));
    expect(res.status).toBe(303);
  });

  it('8. no exception in petition mode while no area is defined', async () => {
    stubFetch();
    const h = await addHousehold({ inArea: 0 });
    const id = await createDraftVersion(db(), { mode: 'petition', title: 'County petition', body: 'County words.', attestation: 'I live here.', sourceNote: 'PWC DOT' }, new Date().toISOString());
    await publishVersion(db(), id, new Date().toISOString());
    const page = await call(get('/sign'));
    expect(await page.text()).toContain('petition area');
    const res = await call(postForm('/sign', await signBody(h.id)));
    // Refused; with no eligible households the page explains the area is not set yet.
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('petition area');
    expect(await countLogs('invalid_address')).toBe(1);
    expect(await signatureCount()).toBe(0);
  });

  it('9. a second signature from the same household is refused without revealing the first signer', async () => {
    stubFetch();
    const h = await addHousehold();
    const first = await call(postForm('/sign', await signBody(h.id, { full_name: 'Alice Firstsigner', typed_signature: 'Alice Firstsigner', email: 'alice@example.com' })));
    expect(first.status).toBe(303);
    const second = await call(postForm('/sign', await signBody(h.id, { full_name: 'Bob Second', typed_signature: 'Bob Second', email: 'bob@example.com' }), { headers: { 'CF-Connecting-IP': '198.51.100.200' } }));
    expect(second.status).toBe(409);
    const html = await second.text();
    expect(html).toContain(esc(DUPLICATE_MESSAGE));
    expect(html).not.toContain('Alice');
    expect(html).not.toContain('alice@example.com');
    const n = await db().prepare("SELECT COUNT(*) AS n FROM signatures WHERE household_id = ? AND status = 'active'").bind(h.id).first<{ n: number }>();
    expect(n?.n).toBe(1);
    const log = await lastLog('duplicate_household');
    expect(log?.household_id).toBe(h.id);
    expect(log?.detail ?? '').not.toContain('Alice');
  });

  it('pledge and petition signatures are separate per household', async () => {
    stubFetch();
    const h = await addHousehold();
    expect((await call(postForm('/sign', await signBody(h.id)))).status).toBe(303);
    const id = await createDraftVersion(db(), { mode: 'petition', title: 'County petition', body: 'County words.', attestation: 'I live here.', sourceNote: '' }, new Date().toISOString());
    await publishVersion(db(), id, new Date().toISOString());
    const res = await call(postForm('/sign', await signBody(h.id)));
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/thanks?mode=petition');
  });

  it('logs the client IP on refusals', async () => {
    stubFetch({ turnstile: false });
    const h = await addHousehold();
    await call(postForm('/sign', await signBody(h.id)));
    expect((await lastLog('turnstile_fail'))?.ip_address).toBe(DEFAULT_IP);
  });
});
