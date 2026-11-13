import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unsubscribeToken } from '../src/lib/crypto';
import { createDraftVersion, publishVersion } from '../src/lib/petition';
import { computeProgress } from '../src/lib/progress';
import { getSettings } from '../src/lib/settings';
import { insertSignature } from '../src/lib/signatures';
import { CONTENT_SECURITY_POLICY } from '../src/lib/security';
import {
  addHousehold,
  blockedLimiter,
  call,
  countLogs,
  db,
  get,
  postForm,
  resetDb,
  setSetting,
  signBody,
  stubFetch,
  testEnv,
} from './helpers';

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function addSignature(householdId: string, over: Partial<Parameters<typeof insertSignature>[1]> = {}) {
  const r = await insertSignature(db(), {
    householdId,
    versionId: '00000000-0000-4000-8000-000000000001',
    mode: 'pledge',
    fullName: 'Secret Signer',
    email: 'secret@example.com',
    phone: null,
    relationship: 'owner',
    typedSignature: 'Secret Signer',
    updatesOptIn: true,
    signedAt: new Date().toISOString(),
    meta: { ip: '203.0.113.9', userAgent: 'UA', country: 'US', asn: 1 },
    flags: [],
    entryMethod: 'online',
    ...over,
  });
  if (!r.ok) throw new Error('duplicate');
  return r;
}

async function progress() {
  const s = await getSettings(db());
  return computeProgress(db(), s, s.site_mode === 'petition' ? 'petition' : 'pledge');
}

describe('security headers', () => {
  it('are set on pages, errors and admin refusals', async () => {
    for (const path of ['/', '/sign', '/privacy', '/faq', '/does-not-exist', '/admin']) {
      const res = await call(get(path));
      expect(res.headers.get('Content-Security-Policy'), path).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers.get('Referrer-Policy'), path).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('X-Content-Type-Options'), path).toBe('nosniff');
      expect(res.headers.get('Permissions-Policy'), path).toContain('camera=()');
    }
    expect((await call(get('/does-not-exist'))).status).toBe(404);
  });

  it('CSP matches the spec', () => {
    expect(CONTENT_SECURITY_POLICY).toBe(
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
  });

  it('pages carry no inline scripts or style attributes', async () => {
    await addHousehold();
    for (const path of ['/', '/sign', '/privacy', '/faq']) {
      const html = await (await call(get(path))).text();
      expect(html, path).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
      expect(html, path).not.toMatch(/\sstyle="/);
      expect(html, path).not.toMatch(/\son[a-z]+="/);
    }
  });
});

describe('home and static pages', () => {
  it('home says resident-run, links privacy, and keeps ?src=mailer on the sign link only', async () => {
    const res = await call(get('/?src=mailer'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeNull();
    const html = await res.text();
    expect(html).toContain('/sign?src=mailer');
    expect(html).toMatch(/resident-run/i);
    expect(html).toMatch(/not an official site/i);
    expect(html).toContain('href="/privacy"');
  });

  it('privacy notice covers the required points', async () => {
    await setSetting('organizer_email', 'organizer@example.com');
    const html = await (await call(get('/privacy'))).text();
    for (const s of ['Todd Wardzinski', 'organizer@example.com', 'IP', 'Cloudflare', '365 days', '730 days', '90 days', '30 days', 'public records', 'withdraw', 'Turnstile', 'Last updated']) {
      expect(html, s).toContain(s);
    }
    expect(html).toMatch(/not<\/strong> run by the HOA/);
  });

  it('faq answers the required questions', async () => {
    const html = await (await call(get('/faq'))).text();
    for (const s of ['Who runs this site', 'official', 'IP address', 'rent', 'already signed', 'paper']) expect(html).toContain(s);
  });

  it('thanks page depends on mode and email setting', async () => {
    const withEmail = await (await call(get('/thanks?mode=pledge'))).text();
    expect(withEmail).toContain('confirmation email');
    const noEmail = await (await call(get('/thanks?mode=petition'), testEnv({ EMAIL_ENABLED: 'false' }))).text();
    expect(noEmail).toContain('contact the organizer');
    expect(noEmail).not.toContain('confirmation email');
  });
});

describe('progress', () => {
  it('hides the bar until the petition area is set', async () => {
    await addHousehold({ inArea: 0 });
    const html = await (await call(get('/'))).text();
    expect(html).toContain('Progress will appear once the petition area is set.');
    const p = await progress();
    expect(p.occupied_total).toBe(0);
    expect(p.percent).toBe(0);
  });

  it('counts only in-area, occupied, active households and never shows names', async () => {
    const a = await addHousehold({ inArea: 1 });
    const b = await addHousehold({ inArea: 1 });
    await addHousehold({ inArea: 1 });
    const vacant = await addHousehold({ inArea: 1, occupied: 0 });
    const outside = await addHousehold({ inArea: 0 });
    await addSignature(a.id);
    await addSignature(b.id, { fullName: 'Other Person', email: 'o@example.com' });
    await addSignature(vacant.id, { fullName: 'Vacant Signer', email: 'v@example.com' });
    await addSignature(outside.id, { fullName: 'Outside Signer', email: 'x@example.com' });
    const p = await progress();
    expect(p).toMatchObject({ signed: 2, occupied_total: 3, percent: 66.6, goal_percent: 75 });
    const html = await (await call(get('/'))).text();
    expect(html).toContain('66.6%');
    expect(html).not.toContain('Secret Signer');
    expect(html).not.toContain('Vacant Signer');
  });

  it('respects occupied_override', async () => {
    const a = await addHousehold({ inArea: 1 });
    await addSignature(a.id);
    await setSetting('occupied_override', '8');
    const p = await progress();
    expect(p).toMatchObject({ signed: 1, occupied_total: 8, percent: 12.5 });
  });

  it('respects require_email_confirmation (paper always counts)', async () => {
    const a = await addHousehold({ inArea: 1 });
    const b = await addHousehold({ inArea: 1 });
    const c = await addHousehold({ inArea: 1 });
    await addHousehold({ inArea: 1 });
    const sa = await addSignature(a.id);
    await addSignature(b.id, { fullName: 'B Person', email: 'b@example.com' });
    await addSignature(c.id, { fullName: 'Paper Person', email: '', entryMethod: 'paper', meta: null });
    await db().prepare('UPDATE signatures SET email_confirmed_at = ? WHERE id = ?').bind(new Date().toISOString(), sa.id).run();
    expect((await progress()).signed).toBe(3);
    await setSetting('require_email_confirmation', 'true');
    expect((await progress()).signed).toBe(2);
  });

  it('counts the current mode only', async () => {
    const a = await addHousehold({ inArea: 1 });
    await addHousehold({ inArea: 1 });
    await addSignature(a.id);
    expect((await progress()).signed).toBe(1);
    const id = await createDraftVersion(db(), { mode: 'petition', title: 'P', body: 'B', attestation: 'A', sourceNote: '' }, new Date().toISOString());
    await publishVersion(db(), id, new Date().toISOString());
    expect((await getSettings(db())).site_mode).toBe('petition');
    expect((await progress()).signed).toBe(0);
  });

  it('/api/progress returns the spec shape and is cacheable', async () => {
    const a = await addHousehold({ inArea: 1 });
    await addHousehold({ inArea: 1 });
    await addSignature(a.id);
    const res = await call(get('/api/progress'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('max-age=60');
    const body = await res.json<Record<string, unknown>>();
    expect(Object.keys(body).sort()).toEqual(['goal_percent', 'mode', 'occupied_total', 'percent', 'signed', 'updated_at']);
    expect(body).toMatchObject({ goal_percent: 75, mode: 'pledge' });
    expect(JSON.stringify(body)).not.toContain('Secret');
  });
});

describe('address search', () => {
  it('requires at least 2 characters', async () => {
    expect((await call(get('/api/address-search?q=1'))).status).toBe(400);
    expect((await call(get('/api/address-search'))).status).toBe(400);
  });

  it('matches by house number, prefix and street word; returns only id and label', async () => {
    const a = await addHousehold({ number: '12345', street: 'Victory Lakes Loop' });
    const b = await addHousehold({ number: '12347', street: 'Victory Lakes Loop' });
    await addHousehold({ number: '500', street: 'Lakeview Court' });
    await addSignature(a.id);
    const res = await call(get('/api/address-search?q=1234'));
    const rows = await res.json<{ id: string; label: string }[]>();
    expect(rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['id', 'label']);
    expect(JSON.stringify(rows)).not.toMatch(/sign|pledge|status/i);
    const abbrev = await (await call(get('/api/address-search?q=12345%20victory%20lakes%20lp'))).json<{ id: string }[]>();
    expect(abbrev.map((r) => r.id)).toEqual([a.id]);
    const word = await (await call(get('/api/address-search?q=lakeview'))).json<unknown[]>();
    expect(word.length).toBe(1);
  });

  it('returns at most 10 and excludes out-of-area homes once the area is set', async () => {
    for (let i = 0; i < 12; i++) await addHousehold({ number: `77${String(i).padStart(2, '0')}`, inArea: 1 });
    await addHousehold({ number: '7799', inArea: 0 });
    const rows = await (await call(get('/api/address-search?q=77'))).json<{ label: string }[]>();
    expect(rows.length).toBe(10);
    const out = await (await call(get('/api/address-search?q=7799'))).json<unknown[]>();
    expect(out.length).toBe(0);
  });

  it('is rate limited', async () => {
    const res = await call(get('/api/address-search?q=12'), testEnv({ SEARCH_LIMITER: blockedLimiter }));
    expect(res.status).toBe(429);
  });
});

describe('confirm, withdraw and unsubscribe', () => {
  it('confirms an email once and logs it', async () => {
    const h = await addHousehold();
    const s = await addSignature(h.id);
    const res = await call(get(`/confirm?token=${s.token}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Email confirmed');
    await call(get(`/confirm?token=${s.token}`));
    const row = await db().prepare('SELECT email_confirmed_at FROM signatures WHERE id = ?').bind(s.id).first<{ email_confirmed_at: string }>();
    expect(row?.email_confirmed_at).toBeTruthy();
    expect(await countLogs('confirm_email')).toBe(1);
    expect((await call(get('/confirm?token=nope'))).status).toBe(404);
  });

  it('withdraw shows a summary on GET, withdraws on POST and drops out of progress immediately', async () => {
    const h = await addHousehold({ inArea: 1 });
    await addHousehold({ inArea: 1 });
    const s = await addSignature(h.id);
    expect((await progress()).signed).toBe(1);
    const page = await call(get(`/withdraw?token=${s.token}`));
    const html = await page.text();
    expect(html).toContain('Secret Signer');
    expect(html).toContain(h.label);
    expect(html).toContain('Withdraw my pledge');
    // GET alone changes nothing (link scanners)
    expect((await progress()).signed).toBe(1);
    const res = await call(postForm('/withdraw', { token: s.token }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('has been withdrawn');
    const row = await db().prepare('SELECT status, status_changed_at FROM signatures WHERE id = ?').bind(s.id).first<{ status: string; status_changed_at: string }>();
    expect(row?.status).toBe('withdrawn');
    expect(row?.status_changed_at).toBeTruthy();
    expect((await progress()).signed).toBe(0);
    expect(await countLogs('withdraw')).toBe(1);
    // The household can sign again
    stubFetch();
    expect((await call(postForm('/sign', await signBody(h.id)))).status).toBe(303);
  });

  it('withdraw POST requires same origin and a valid token', async () => {
    const h = await addHousehold();
    const s = await addSignature(h.id);
    expect((await call(postForm('/withdraw', { token: s.token }, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await call(postForm('/withdraw', { token: 'x'.repeat(43) }))).status).toBe(404);
    const row = await db().prepare('SELECT status FROM signatures WHERE id = ?').bind(s.id).first<{ status: string }>();
    expect(row?.status).toBe('active');
  });

  it('unsubscribe uses a stateless HMAC link and clears opt-in for that email', async () => {
    const h1 = await addHousehold();
    const h2 = await addHousehold();
    const paper = await addHousehold();
    const s1 = await addSignature(h1.id);
    await addSignature(h2.id, { fullName: 'Same Email', email: 'secret@example.com' });
    await addSignature(paper.id, { fullName: 'Paper Person', email: '', entryMethod: 'paper', meta: null });
    const sig = await unsubscribeToken(env.FORM_HMAC_KEY, s1.id);
    expect((await call(get(`/unsubscribe?sid=${s1.id}&sig=bad`))).status).toBe(404);
    const page = await call(get(`/unsubscribe?sid=${s1.id}&sig=${encodeURIComponent(sig)}`));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Stop update emails');
    const res = await call(postForm('/unsubscribe', { sid: s1.id, sig }));
    expect(res.status).toBe(200);
    const rows = await db().prepare('SELECT email, updates_opt_in FROM signatures ORDER BY email').all<{ email: string; updates_opt_in: number }>();
    expect(rows.results).toEqual([
      { email: '', updates_opt_in: 1 },
      { email: 'secret@example.com', updates_opt_in: 0 },
      { email: 'secret@example.com', updates_opt_in: 0 },
    ]);
    expect(await countLogs('unsubscribe')).toBe(1);
  });
});
