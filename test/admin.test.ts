import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureCsv from './fixtures/households.csv?raw';
import { clearAccessKeys } from '../src/lib/access';
import { sha256Hex } from '../src/lib/crypto';
import { UTF8_BOM, parseCsv } from '../src/lib/csv';
import { getSettings } from '../src/lib/settings';
import { insertSignature } from '../src/lib/signatures';
import {
  adminClient,
  addHousehold,
  call,
  db,
  get,
  makeAccessKeys,
  postForm,
  resetDb,
  setSetting,
  signJwt,
  stubFetch,
  testEnv,
} from './helpers';

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const SEED = '00000000-0000-4000-8000-000000000001';

async function addSig(householdId: string, over: Partial<Parameters<typeof insertSignature>[1]> = {}) {
  const r = await insertSignature(db(), {
    householdId,
    versionId: SEED,
    mode: 'pledge',
    fullName: 'Pat Signer',
    email: 'pat@example.com',
    phone: '7035550100',
    relationship: 'owner',
    typedSignature: 'Pat Signer',
    updatesOptIn: false,
    signedAt: '2026-11-13T20:04:05.000Z',
    meta: { ip: '203.0.113.50', userAgent: 'UA-Admin-Test', country: 'US', asn: 7922 },
    flags: [],
    entryMethod: 'online',
    ...over,
  });
  if (!r.ok) throw new Error('duplicate');
  return r;
}

async function auditCount(action: string): Promise<number> {
  const r = await db().prepare('SELECT COUNT(*) AS n FROM admin_audit WHERE action = ?').bind(action).first<{ n: number }>();
  return r?.n ?? 0;
}

async function publishPetition(admin: Awaited<ReturnType<typeof adminClient>>, title = 'County petition for traffic calming') {
  const created = await admin.post('/admin/petition', {
    mode: 'petition',
    title,
    body: 'We, the undersigned residents, request traffic calming on Victory Lakes Loop.',
    attestation: 'I reside at the address listed.',
    source_note: 'Synthetic test text',
  });
  expect(created.status).toBe(303);
  const id = created.headers.get('Location')!.split('/')[3]!.split('?')[0]!;
  const pub = await admin.post(`/admin/petition/${id}/publish`, {});
  expect(pub.status).toBe(303);
  return id;
}

describe('admin authentication', () => {
  it('refuses requests without a JWT', async () => {
    for (const path of ['/admin', '/admin/signatures', '/admin/export.csv', '/api/admin/progress']) {
      const res = await call(get(path));
      expect(res.status, path).toBe(403);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('refuses forged, wrong-audience, expired and email-less tokens', async () => {
    const { privateKey, kid } = await makeAccessKeys();
    const other = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const forged = await signJwt((other as CryptoKeyPair).privateKey, kid);
    const wrongAud = await signJwt(privateKey, kid, { aud: ['someone-else'] });
    const expired = await signJwt(privateKey, kid, { exp: Math.floor(Date.now() / 1000) - 3600 });
    const noEmail = await signJwt(privateKey, kid, { email: undefined });
    const wrongIss = await signJwt(privateKey, kid, { iss: 'https://evil.cloudflareaccess.com' });
    const garbage = 'abc.def.ghi';
    for (const token of [forged, wrongAud, expired, noEmail, wrongIss, garbage]) {
      const res = await call(get('/admin', { 'Cf-Access-Jwt-Assertion': token }));
      expect(res.status).toBe(403);
    }
  });

  it('refuses tokens signed with an unknown key id (and fails closed if certs are unreachable)', async () => {
    const { privateKey } = await makeAccessKeys();
    stubFetch(); // certs URL returns 404
    const token = await signJwt(privateKey, 'unknown-kid');
    expect((await call(get('/admin', { 'Cf-Access-Jwt-Assertion': token }))).status).toBe(403);
  });

  it('accepts a valid Access JWT, uses its email for audit and sends no-store', async () => {
    const admin = await adminClient('Todd@Example.com');
    const res = await admin.get('/admin');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain('todd@example.com');
    await admin.get('/admin/export.csv?mode=pledge');
    const row = await db().prepare("SELECT admin_email FROM admin_audit WHERE action = 'export_csv'").first<{ admin_email: string }>();
    expect(row?.admin_email).toBe('todd@example.com');
  });

  it('honours DEV_ADMIN_EMAIL only on localhost', async () => {
    clearAccessKeys();
    const e = testEnv({ DEV_ADMIN_EMAIL: 'dev@localhost' });
    expect((await call(get('/admin', {}, 'http://localhost:8787'), e)).status).toBe(200);
    expect((await call(get('/admin', {}, 'http://127.0.0.1:8787'), e)).status).toBe(200);
    expect((await call(get('/admin'), e)).status).toBe(403);
  });

  it('path tricks never reach admin pages without a JWT', async () => {
    for (const path of ['//admin', '/%61dmin', '/admin/', '/ADMIN', '/admin%2Fsignatures', '/./admin', '/api/admin/progress', '/%61pi/admin/progress']) {
      const res = await call(get(path));
      expect([403, 404], path).toContain(res.status);
      expect(await res.text(), path).not.toContain('Signed in as');
    }
  });

  it('admin POSTs require same origin even with a valid JWT', async () => {
    const admin = await adminClient();
    const res = await call(postForm('/admin/mode', { to: 'closed' }, { headers: { 'Cf-Access-Jwt-Assertion': admin.token }, origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect((await getSettings(db())).site_mode).toBe('pledge');
  });

  it('every admin page renders', async () => {
    const admin = await adminClient();
    const h = await addHousehold();
    const s = await addSig(h.id);
    for (const path of [
      '/admin',
      '/admin/signatures',
      `/admin/signatures/${s.id}`,
      '/admin/paper',
      '/admin/households',
      `/admin/households/${h.id}`,
      '/admin/households/import',
      '/admin/petition',
      `/admin/petition/${SEED}`,
      '/admin/petition/new',
      '/admin/mode',
      '/admin/mode/confirm?to=closed',
      '/admin/followups',
      '/admin/export',
      '/admin/settings',
      '/admin/audit',
      '/api/admin/progress',
    ]) {
      const res = await admin.get(path);
      expect(res.status, path).toBe(200);
    }
  });
});

describe('signature review', () => {
  it('lists with filters and shows IP only on the detail view', async () => {
    const admin = await adminClient();
    const a = await addHousehold();
    const b = await addHousehold({ street: 'Example Lake Court' });
    const sa = await addSig(a.id, { flags: ['shared_ip'] });
    await addSig(b.id, { fullName: 'Robin Other', email: 'robin@example.com' });
    const list = await (await admin.get('/admin/signatures')).text();
    expect(list).toContain('Pat Signer');
    expect(list).toContain('Robin Other');
    expect(list).not.toContain('203.0.113.50');
    const flagged = await (await admin.get('/admin/signatures?flagged=1')).text();
    expect(flagged).toContain('Pat Signer');
    expect(flagged).not.toContain('Robin Other');
    const street = await (await admin.get('/admin/signatures?street=Example%20Lake%20Court')).text();
    expect(street).toContain('Robin Other');
    expect(street).not.toContain('Pat Signer');
    const detail = await (await admin.get(`/admin/signatures/${sa.id}`)).text();
    expect(detail).toContain('203.0.113.50');
    expect(detail).toContain('UA-Admin-Test');
  });

  it('reject requires a reason, writes audit, and restore puts it back', async () => {
    const admin = await adminClient();
    const h = await addHousehold();
    const s = await addSig(h.id);
    expect((await admin.post(`/admin/signatures/${s.id}/reject`, { reason: '' })).status).toBe(422);
    const r = await admin.post(`/admin/signatures/${s.id}/reject`, { reason: 'Not a resident' });
    expect(r.status).toBe(303);
    let row = await db().prepare('SELECT status, status_reason FROM signatures WHERE id = ?').bind(s.id).first<{ status: string; status_reason: string }>();
    expect(row).toEqual({ status: 'rejected', status_reason: 'Not a resident' });
    expect(await auditCount('reject')).toBe(1);
    expect((await admin.post(`/admin/signatures/${s.id}/restore`, {})).status).toBe(303);
    row = await db().prepare('SELECT status, status_reason FROM signatures WHERE id = ?').bind(s.id).first();
    expect(row?.status).toBe('active');
    expect(await auditCount('restore')).toBe(1);
  });

  it('restore is refused when the household already has another active signature', async () => {
    const admin = await adminClient();
    const h = await addHousehold();
    const s1 = await addSig(h.id);
    await admin.post(`/admin/signatures/${s1.id}/reject`, { reason: 'dup' });
    await addSig(h.id, { fullName: 'Second Person', email: 's@example.com' });
    const res = await admin.post(`/admin/signatures/${s1.id}/restore`, {});
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('already has another active signature');
  });

  it('mark household vacant removes it from the denominator', async () => {
    const admin = await adminClient();
    const h = await addHousehold({ inArea: 1 });
    await addHousehold({ inArea: 1 });
    const s = await addSig(h.id);
    const res = await admin.post(`/admin/households/${h.id}/vacant`, { return_to: `/admin/signatures/${s.id}` });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(`/admin/signatures/${s.id}?msg=vacant`);
    const row = await db().prepare('SELECT occupied FROM households WHERE id = ?').bind(h.id).first<{ occupied: number }>();
    expect(row?.occupied).toBe(0);
    expect(await auditCount('mark_vacant')).toBe(1);
    // open redirect is not possible
    const evil = await admin.post(`/admin/households/${h.id}/vacant`, { return_to: 'https://evil.example/' });
    expect(evil.headers.get('Location')).toBe(`/admin/households/${h.id}?msg=vacant`);
  });
});

describe('paper entry', () => {
  it('adds a paper signature with no IP and the paper note', async () => {
    const admin = await adminClient();
    const h = await addHousehold();
    const res = await admin.post('/admin/paper', {
      household_id: h.id,
      full_name: 'Paper Signer',
      relationship: 'renter',
      signed_date: '2026-11-10',
      email: '',
      phone: '',
      note: 'collected at door',
    });
    expect(res.status).toBe(303);
    const row = await db().prepare('SELECT * FROM signatures WHERE household_id = ?').bind(h.id).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      entry_method: 'paper',
      relationship: 'renter',
      ip_address: null,
      user_agent: null,
      email: '',
      mode: 'pledge',
      signed_at: '2026-11-10T17:00:00.000Z',
    });
    expect(row!.status_reason).toBe('entered_by_admin: paper; collected at door');
    expect(await auditCount('paper_entry')).toBe(1);
  });

  it('validates and refuses a duplicate household', async () => {
    const admin = await adminClient();
    const h = await addHousehold();
    await addSig(h.id);
    expect((await admin.post('/admin/paper', { household_id: h.id, full_name: 'X', relationship: 'owner', signed_date: '2026-11-10' })).status).toBe(422);
    expect((await admin.post('/admin/paper', { household_id: h.id, full_name: 'Paper Two', relationship: 'owner', signed_date: '2099-01-01' })).status).toBe(422);
    const dup = await admin.post('/admin/paper', { household_id: h.id, full_name: 'Paper Two', relationship: 'owner', signed_date: '2026-11-10' });
    expect(dup.status).toBe(409);
  });
});

describe('households', () => {
  it('import previews a diff and applies it only with the matching hash', async () => {
    const admin = await adminClient();
    const existing = await addHousehold({ number: '90003', street: 'Victory Lakes Loop', inArea: 0 });
    const stale = await addHousehold({ number: '1', street: 'Gone Away Lane' });
    const preview = await admin.post('/admin/households/import', { csv: fixtureCsv });
    expect(preview.status).toBe(200);
    const html = await preview.text();
    expect(html).toContain('90001 Victory Lakes Loop');
    expect(html).toContain('90009 Victory Lakes Loop, Unit A');
    expect(html).toMatch(/in_petition_area<\/code>: 0 → <strong>1/);
    expect(html).toContain('1 Gone Away Lane');
    // nothing written yet
    expect((await db().prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>())?.n).toBe(2);

    const tampered = await admin.post('/admin/households/import/apply', { csv: `${fixtureCsv}\n99999,Evil St,,20136,1,1,`, hash: await sha256Hex(fixtureCsv) });
    expect(tampered.status).toBe(409);

    const applied = await admin.post('/admin/households/import/apply', { csv: fixtureCsv, hash: await sha256Hex(fixtureCsv), deactivate_missing: '1' });
    expect(applied.status).toBe(303);
    const counts = await db()
      .prepare('SELECT COUNT(*) AS n, SUM(in_petition_area * active) AS area, SUM(active) AS active FROM households')
      .first<{ n: number; area: number; active: number }>();
    expect(counts).toEqual({ n: 8, area: 6, active: 7 });
    const ex = await db().prepare('SELECT in_petition_area FROM households WHERE id = ?').bind(existing.id).first<{ in_petition_area: number }>();
    expect(ex?.in_petition_area).toBe(1);
    const st = await db().prepare('SELECT active FROM households WHERE id = ?').bind(stale.id).first<{ active: number }>();
    expect(st?.active).toBe(0);
    const vacant = await db().prepare("SELECT occupied FROM households WHERE street_number = '90005'").first<{ occupied: number }>();
    expect(vacant?.occupied).toBe(0);
    const audit = await db().prepare("SELECT detail FROM admin_audit WHERE action = 'import_households'").first<{ detail: string }>();
    expect(JSON.parse(audit!.detail)).toMatchObject({ added: 6, updated: 1, deactivated: 1 });

    // Re-import is a no-op
    const again = await (await admin.post('/admin/households/import', { csv: fixtureCsv })).text();
    expect(again).toMatch(/<h2>New<\/h2><p class="big-number">0<\/p>/);
  });

  it('import accepts a multipart file upload', async () => {
    const admin = await adminClient();
    const fd = new FormData();
    fd.append('file', new File([fixtureCsv], 'households.csv', { type: 'text/csv' }));
    const res = await call(
      new Request('https://petition.test/admin/households/import', {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': admin.token, Origin: 'https://petition.test' },
        body: fd,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('90001 Victory Lakes Loop');
  });

  it('bulk sets the petition area by street and edits a household', async () => {
    const admin = await adminClient();
    const a = await addHousehold({ street: 'Example Lake Court', inArea: 0 });
    await addHousehold({ street: 'Example Lake Court', inArea: 0 });
    await addHousehold({ street: 'Victory Lakes Loop', inArea: 0 });
    expect((await admin.post('/admin/households/bulk-area', { street_name: 'example lake court', in_petition_area: '1' })).status).toBe(303);
    const n = await db().prepare('SELECT SUM(in_petition_area) AS n FROM households').first<{ n: number }>();
    expect(n?.n).toBe(2);
    expect(await auditCount('bulk_area')).toBe(1);

    const bad = await admin.post(`/admin/households/${a.id}`, { street_number: 'x', street_name: '', zip: '1' });
    expect(bad.status).toBe(422);
    const ok = await admin.post(`/admin/households/${a.id}`, {
      street_number: '42',
      street_name: 'Example Lake Ct',
      unit: '',
      zip: '20136',
      in_petition_area: '1',
      occupied: '1',
      active: '1',
      notes: 'renamed',
    });
    expect(ok.status).toBe(303);
    const row = await db().prepare('SELECT label, normalized, notes FROM households WHERE id = ?').bind(a.id).first();
    expect(row).toEqual({ label: '42 Example Lake Ct', normalized: '42 example lake court', notes: 'renamed' });
    expect(await auditCount('edit_household')).toBe(1);
  });
});

describe('petition text and mode', () => {
  it('creates a draft, publishes it, and switches pledge → petition', async () => {
    const admin = await adminClient();
    const id = await publishPetition(admin);
    const v = await db().prepare('SELECT active, published_at, sha256 FROM petition_versions WHERE id = ?').bind(id).first<{ active: number; published_at: string; sha256: string }>();
    expect(v?.active).toBe(1);
    expect(v?.published_at).toBeTruthy();
    expect(v?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const seed = await db().prepare('SELECT active FROM petition_versions WHERE id = ?').bind(SEED).first<{ active: number }>();
    expect(seed?.active).toBe(0);
    expect((await getSettings(db())).site_mode).toBe('petition');
    expect(await auditCount('create_version')).toBe(1);
    expect(await auditCount('publish_version')).toBe(1);
  });

  it('does not convert pledges into petition signatures', async () => {
    const admin = await adminClient();
    const h = await addHousehold({ inArea: 1 });
    await addSig(h.id);
    await publishPetition(admin);
    const n = await db().prepare("SELECT COUNT(*) AS n FROM signatures WHERE mode = 'petition'").first<{ n: number }>();
    expect(n?.n).toBe(0);
    const html = await (await admin.get('/admin/followups')).text();
    expect(html).toContain(h.label);
  });

  it('mode switch rules: needs a matching active text; closed always allowed', async () => {
    const admin = await adminClient();
    const confirm = await (await admin.get('/admin/mode/confirm?to=petition')).text();
    expect(confirm).toContain('no active petition text');
    expect((await admin.post('/admin/mode', { to: 'petition' })).status).toBe(409);
    expect((await getSettings(db())).site_mode).toBe('pledge');
    expect((await admin.post('/admin/mode', { to: 'closed' })).status).toBe(303);
    expect((await getSettings(db())).site_mode).toBe('closed');
    expect((await admin.post('/admin/mode', { to: 'pledge' })).status).toBe(303);
    expect((await getSettings(db())).site_mode).toBe('pledge');
    expect(await auditCount('set_mode')).toBe(2);
  });

  it('publishing while closed keeps the site closed', async () => {
    const admin = await adminClient();
    await setSetting('site_mode', 'closed');
    await publishPetition(admin);
    expect((await getSettings(db())).site_mode).toBe('closed');
  });
});

describe('export and print', () => {
  it('CSV: BOM, spec columns, no IP by default, formula injection neutralised', async () => {
    const admin = await adminClient();
    const h = await addHousehold({ number: '500', street: 'Victory Lakes Loop' });
    await addSig(h.id, { fullName: '=HYPERLINK("http://x")', typedSignature: '+cmd', email: '@evil.example' });
    const h2 = await addHousehold({ number: '502', street: 'Victory Lakes Loop' });
    await addSig(h2.id, { fullName: 'Paper Person', email: '', entryMethod: 'paper', meta: null, typedSignature: '[signed on paper]' });
    const res = await admin.get('/admin/export.csv?mode=pledge&status=active');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="petition-pledge-\d{8}\.csv"$/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await res.text();
    expect(text.startsWith(UTF8_BOM) || text.startsWith('household_address')).toBe(true);
    const rows = parseCsv(text);
    expect(rows[0]).toEqual([
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
    ]);
    const r1 = rows[1]!;
    expect(r1[0]).toBe('500 Victory Lakes Loop');
    expect(r1[1]).toBe(`'=HYPERLINK("http://x")`);
    expect(r1[3]).toBe('2026-11-13 15:04:05 EST');
    expect(r1[4]).toBe(`'+cmd`);
    expect(r1[5]).toBe(`'@evil.example`);
    expect(r1[8]).toBe('a796610f274509cc90db40555381e4da039f025eb1fc33e5ff7b511c902048f6');
    expect(text).not.toContain('203.0.113.50');
    expect(rows[2]![7]).toBe('n/a (paper)');

    const withIp = parseCsv(await (await admin.get('/admin/export.csv?mode=pledge&include_ip=1')).text());
    expect(withIp[0]!.slice(-3)).toEqual(['ip_address', 'user_agent', 'cf_country']);
    expect(withIp[1]!.slice(-3)).toEqual(['203.0.113.50', 'UA-Admin-Test', 'US']);
    const audit = await db().prepare("SELECT detail FROM admin_audit WHERE action = 'export_csv' ORDER BY created_at DESC LIMIT 1").first<{ detail: string }>();
    expect(JSON.parse(audit!.detail)).toMatchObject({ include_ip: true });
  });

  it('print view repeats title and petition language on every page with Page X of Y', async () => {
    const admin = await adminClient();
    const id = await publishPetition(admin, 'Synthetic County Petition Title');
    for (let i = 0; i < 7; i++) {
      const h = await addHousehold({ inArea: 1 });
      await addSig(h.id, { versionId: id, mode: 'petition', fullName: `Signer Number${'abcdefg'[i]}`, email: `s${i}@example.com` });
    }
    const unsigned = await addHousehold({ inArea: 1 });
    const html = await (await admin.get('/admin/print?mode=petition&per_page=3')).text();
    const count = (s: string) => html.split(s).length - 1;
    expect(count('<section class="print-page">')).toBe(3);
    expect(count('<h1>Synthetic County Petition Title</h1>')).toBe(3);
    expect(count('We, the undersigned residents, request traffic calming on Victory Lakes Loop.')).toBe(3);
    for (const p of ['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']) expect(html).toContain(p);
    expect(html).toContain('Signer Numbera');
    expect(html).toContain('Nov 13, 2026');
    expect(html).not.toContain(unsigned.label);
    expect(await auditCount('print')).toBe(1);

    const blank = await (await admin.get('/admin/print?mode=petition&blank=1')).text();
    expect(blank).toContain(unsigned.label);
    expect(blank).not.toContain('Signer Numbera');
    expect(blank).toContain('<h1>Synthetic County Petition Title</h1>');
  });
});

describe('follow-ups and settings', () => {
  it('emails opted-in pledgers once, with an unsubscribe link, only in petition mode', async () => {
    const admin = await adminClient();
    const a = await addHousehold({ inArea: 1 });
    const b = await addHousehold({ inArea: 1 });
    const sa = await addSig(a.id, { updatesOptIn: true, email: 'yes@example.com' });
    await addSig(b.id, { updatesOptIn: false, fullName: 'No Thanks', email: 'no@example.com' });
    const { calls } = stubFetch();
    // pledge mode: nothing sent
    await admin.post('/admin/followups/send', {});
    expect(calls.length).toBe(0);
    await publishPetition(admin);
    const res = await admin.post('/admin/followups/send', {});
    expect(res.status).toBe(303);
    const mails = calls.filter((c) => c.url.startsWith('https://api.resend.com/'));
    expect(mails.length).toBe(1);
    expect(mails[0]!.body).toContain('yes@example.com');
    expect(mails[0]!.body).toContain(`/unsubscribe?sid=${sa.id}&sig=`);
    const row = await db().prepare('SELECT followup_sent_at FROM signatures WHERE id = ?').bind(sa.id).first<{ followup_sent_at: string }>();
    expect(row?.followup_sent_at).toBeTruthy();
    await admin.post('/admin/followups/send', {});
    expect(calls.filter((c) => c.url.startsWith('https://api.resend.com/')).length).toBe(1);
    expect(await auditCount('send_followups')).toBe(2);
  });

  it('validates and saves settings with an audit diff', async () => {
    const admin = await adminClient();
    const base = {
      organizer_name: 'Todd Wardzinski',
      organizer_email: 'organizer@example.com',
      organizer_phone: '',
      co_organizers: 'Renee W.',
      goal_percent: '75',
      occupied_override: '',
      retention_days_ip: '365',
      retention_days_all: '730',
      final_decision_date: '',
      privacy_updated: '2026-11-13',
    };
    expect((await admin.post('/admin/settings', { ...base, goal_percent: '150' })).status).toBe(422);
    expect((await admin.post('/admin/settings', { ...base, organizer_email: 'nope' })).status).toBe(422);
    expect((await admin.post('/admin/settings', { ...base, require_email_confirmation: 'true' })).status).toBe(303);
    const s = await getSettings(db());
    expect(s.organizer_email).toBe('organizer@example.com');
    expect(s.co_organizers).toBe('Renee W.');
    expect(s.require_email_confirmation).toBe(true);
    const audit = await db().prepare("SELECT detail FROM admin_audit WHERE action = 'update_settings'").first<{ detail: string }>();
    expect(JSON.parse(audit!.detail)).toMatchObject({ organizer_email: ['', 'organizer@example.com'] });
    expect((await (await call(get('/'))).text())).toContain('organizer@example.com');
  });
});
