import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { runRetention } from '../src/lib/retention';
import { insertSignature } from '../src/lib/signatures';
import { adminClient, addHousehold, db, resetDb, setSetting } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

beforeEach(async () => {
  await resetDb();
});

async function sig(daysAgo: number, over: { status?: 'withdrawn' | 'rejected'; changedDaysAgo?: number } = {}) {
  const h = await addHousehold();
  const r = await insertSignature(db(), {
    householdId: h.id,
    versionId: '00000000-0000-4000-8000-000000000001',
    mode: 'pledge',
    fullName: `Person ${daysAgo}`,
    email: `p${daysAgo}@example.com`,
    phone: '7035550100',
    relationship: 'owner',
    typedSignature: `Person ${daysAgo}`,
    updatesOptIn: false,
    signedAt: ago(daysAgo),
    meta: { ip: '203.0.113.1', userAgent: 'UA', country: 'US', asn: 1 },
    flags: [],
    entryMethod: 'online',
  });
  if (!r.ok) throw new Error('dup');
  if (over.status) {
    await db()
      .prepare('UPDATE signatures SET status = ?, status_changed_at = ? WHERE id = ?')
      .bind(over.status, ago(over.changedDaysAgo ?? daysAgo), r.id)
      .run();
  }
  return r.id;
}

async function row(id: string) {
  return db().prepare('SELECT * FROM signatures WHERE id = ?').bind(id).first<Record<string, unknown>>();
}

async function log(daysAgo: number, signatureId: string | null = null) {
  await db()
    .prepare('INSERT INTO submission_log (id, event, signature_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), 'sign_ok', signatureId, '203.0.113.1', ago(daysAgo))
    .run();
}

describe('retention job', () => {
  it('clears IP and browser details after retention_days_ip and drops old logs', async () => {
    await setSetting('retention_days_ip', '10');
    const old = await sig(20);
    const recent = await sig(5);
    await log(20);
    await log(5);
    const res = await runRetention(db());
    expect(res.ip_cleared).toBe(1);
    expect(await row(old)).toMatchObject({ ip_address: null, user_agent: null, cf_asn: null, full_name: 'Person 20' });
    expect(await row(recent)).toMatchObject({ ip_address: '203.0.113.1', user_agent: 'UA' });
    const logs = await db().prepare('SELECT COUNT(*) AS n FROM submission_log').first<{ n: number }>();
    expect(logs?.n).toBe(1);
  });

  it('scrubs withdrawn signatures after 30 days, keeping household, dates and status', async () => {
    const oldW = await sig(60, { status: 'withdrawn', changedDaysAgo: 31 });
    const newW = await sig(60, { status: 'withdrawn', changedDaysAgo: 10 });
    const res = await runRetention(db());
    expect(res.withdrawn_scrubbed).toBe(1);
    expect(await row(oldW)).toMatchObject({
      full_name: '[withdrawn]',
      email: '',
      phone: null,
      typed_signature: '[withdrawn]',
      ip_address: null,
      status: 'withdrawn',
    });
    expect((await row(oldW))!.household_id).toBeTruthy();
    expect((await row(oldW))!.signed_at).toBeTruthy();
    expect(await row(newW)).toMatchObject({ full_name: 'Person 60', status: 'withdrawn' });
    // idempotent
    expect((await runRetention(db())).withdrawn_scrubbed).toBe(0);
  });

  it('never deletes rows younger than 365 days while the site is not closed', async () => {
    await setSetting('retention_days_all', '15');
    const young = await sig(20);
    const ancient = await sig(400);
    await log(1, ancient);
    const res = await runRetention(db());
    expect(res.signatures_deleted).toBe(1);
    expect(await row(young)).not.toBeNull();
    expect(await row(ancient)).toBeNull();
    // logs that pointed at the deleted signature are gone
    const logs = await db().prepare('SELECT COUNT(*) AS n FROM submission_log WHERE signature_id = ?').bind(ancient).first<{ n: number }>();
    expect(logs?.n).toBe(0);
  });

  it('deletes past retention_days_all once closed', async () => {
    await setSetting('retention_days_all', '15');
    await setSetting('site_mode', 'closed');
    const young = await sig(20);
    const fresh = await sig(2);
    await runRetention(db());
    expect(await row(young)).toBeNull();
    expect(await row(fresh)).not.toBeNull();
    // households are kept
    const h = await db().prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>();
    expect(h?.n).toBe(2);
  });

  it('deletes everything 90 days after the final decision (closed), but not while open', async () => {
    const decided = new Date(Date.now() - 100 * DAY);
    const date = decided.toISOString().slice(0, 10);
    await setSetting('final_decision_date', date);
    const recent = await sig(3);
    await log(1);
    await runRetention(db());
    expect(await row(recent)).not.toBeNull(); // still pledge mode → protected
    await setSetting('site_mode', 'closed');
    const res = await runRetention(db());
    expect(res.signatures_deleted).toBe(1);
    expect(await row(recent)).toBeNull();
    const logs = await db().prepare('SELECT COUNT(*) AS n FROM submission_log').first<{ n: number }>();
    expect(logs?.n).toBe(0);
  });

  it('writes a purge audit row with counts', async () => {
    await setSetting('retention_days_ip', '10');
    await sig(20);
    await runRetention(db());
    const a = await db().prepare("SELECT admin_email, detail FROM admin_audit WHERE action = 'purge'").first<{ admin_email: string; detail: string }>();
    expect(a?.admin_email).toBe('system:cron');
    expect(JSON.parse(a!.detail)).toMatchObject({ ip_cleared: 1, signatures_deleted: 0, protected: true });
  });

  it('runs from the scheduled handler and from the admin button', async () => {
    await setSetting('retention_days_ip', '10');
    const id = await sig(20);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: '17 7 * * *' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await row(id))!.ip_address).toBeNull();

    const admin = await adminClient('organizer@example.com');
    const res = await admin.post('/admin/retention/run', {});
    expect(res.status).toBe(303);
    const purges = await db().prepare("SELECT admin_email FROM admin_audit WHERE action = 'purge' ORDER BY created_at").all<{ admin_email: string }>();
    expect(purges.results.map((r) => r.admin_email)).toEqual(['system:cron', 'organizer@example.com']);
  });
});
