import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { vi } from 'vitest';
import type { AppEnv, RateLimiter } from '../src/env';
import { householdLabel, normalizeHousehold } from '../src/lib/address';
import { base64UrlEncode, issueFormToken } from '../src/lib/crypto';
import { primeAccessKeys } from '../src/lib/access';
import worker from '../src/index';

export const ORIGIN = 'https://petition.test';
export const SEED_VERSION_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_IP = '203.0.113.5';

export const okLimiter: RateLimiter = { limit: async () => ({ success: true }) };
export const blockedLimiter: RateLimiter = { limit: async () => ({ success: false }) };

export function testEnv(over: Partial<AppEnv> = {}): AppEnv {
  return { ...(env as unknown as AppEnv), SUBMIT_LIMITER: okLimiter, SEARCH_LIMITER: okLimiter, ...over };
}

export const db = (): D1Database => env.DB;

export async function call(req: Request, e: AppEnv = testEnv()): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req as Request<unknown, IncomingRequestCfProperties>, e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export function get(path: string, headers: Record<string, string> = {}, base = ORIGIN): Request {
  return new Request(`${base}${path}`, { headers: { 'CF-Connecting-IP': DEFAULT_IP, ...headers } });
}

export function postForm(
  path: string,
  data: Record<string, string>,
  opts: { headers?: Record<string, string>; origin?: string | null; cf?: Record<string, unknown>; base?: string } = {},
): Request {
  const headers: Record<string, string> = {
    'CF-Connecting-IP': DEFAULT_IP,
    'User-Agent': 'Mozilla/5.0 (Test) Vitest',
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(opts.headers ?? {}),
  };
  const origin = opts.origin === undefined ? (opts.base ?? ORIGIN) : opts.origin;
  if (origin) headers.Origin = origin;
  return new Request(`${opts.base ?? ORIGIN}${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(data).toString(),
    cf: opts.cf ?? { country: 'US', asn: 7922 },
  } as RequestInit);
}

/* ---------------------------------------------------------------- database */

const SETTINGS_DEFAULTS: Record<string, string> = {
  site_mode: 'pledge',
  goal_percent: '75',
  occupied_override: '',
  organizer_name: 'Todd Wardzinski',
  organizer_email: '',
  organizer_phone: '',
  co_organizers: '',
  retention_days_ip: '365',
  retention_days_all: '730',
  require_email_confirmation: 'false',
  final_decision_date: '',
  privacy_updated: '2026-11-13',
};

/** Wipes mutable tables and restores seeded settings and the seeded pledge version. */
export async function resetDb(): Promise<void> {
  const d = db();
  await d.batch([
    d.prepare('DELETE FROM signatures'),
    d.prepare('DELETE FROM submission_log'),
    d.prepare('DELETE FROM admin_audit'),
    d.prepare('DELETE FROM households'),
    d.prepare('DELETE FROM petition_versions WHERE id != ?').bind(SEED_VERSION_ID),
    d.prepare('UPDATE petition_versions SET active = 1 WHERE id = ?').bind(SEED_VERSION_ID),
    d.prepare('DELETE FROM settings'),
    ...Object.entries(SETTINGS_DEFAULTS).map(([k, v]) => d.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind(k, v)),
  ]);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

let houseCounter = 10000;

export async function addHousehold(
  opts: { number?: string; street?: string; unit?: string | null; zip?: string; inArea?: 0 | 1; occupied?: 0 | 1; active?: 0 | 1 } = {},
): Promise<{ id: string; label: string }> {
  const number = opts.number ?? String(houseCounter++);
  const street = opts.street ?? 'Victory Lakes Loop';
  const unit = opts.unit ?? null;
  const id = crypto.randomUUID();
  const label = householdLabel(number, street, unit);
  const now = new Date().toISOString();
  await db()
    .prepare(
      `INSERT INTO households (id, street_number, street_name, unit, zip, label, normalized, in_petition_area, occupied, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, number, street, unit, opts.zip ?? '20136', label, normalizeHousehold(number, street, unit), opts.inArea ?? 1, opts.occupied ?? 1, opts.active ?? 1, now, now)
    .run();
  return { id, label };
}

export async function activeVersionId(): Promise<string> {
  const row = await db().prepare('SELECT id FROM petition_versions WHERE active = 1').first<{ id: string }>();
  return row!.id;
}

export async function oldFormToken(ageMs = 10_000): Promise<string> {
  return issueFormToken(testEnv().FORM_HMAC_KEY, Date.now() - ageMs);
}

export async function signBody(
  householdId: string,
  over: Record<string, string> = {},
): Promise<Record<string, string>> {
  const name = over.full_name ?? 'Jane Q. Neighbor';
  return {
    household_id: householdId,
    full_name: name,
    email: 'jane@example.com',
    phone: '',
    relationship: 'owner',
    attest_adult: '1',
    attest_resident: '1',
    typed_signature: name,
    petition_version_id: await activeVersionId(),
    form_started_at: await oldFormToken(),
    'cf-turnstile-response': 'test-token',
    ...over,
  };
}

export async function lastLog(event?: string): Promise<{ event: string; detail: string | null; ip_address: string | null; household_id: string | null; signature_id: string | null } | null> {
  return event
    ? db().prepare('SELECT * FROM submission_log WHERE event = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(event).first()
    : db().prepare('SELECT * FROM submission_log ORDER BY created_at DESC, rowid DESC LIMIT 1').first();
}

export async function countLogs(event: string): Promise<number> {
  const r = await db().prepare('SELECT COUNT(*) AS n FROM submission_log WHERE event = ?').bind(event).first<{ n: number }>();
  return r?.n ?? 0;
}

/* ---------------------------------------------------------------- outbound fetch */

export interface FetchCall {
  url: string;
  method: string;
  body: string;
}

/**
 * Stubs global fetch: Turnstile siteverify (success unless `turnstile: false`), email
 * providers (200) and anything else (404). Returns the recorded calls.
 */
export function stubFetch(opts: { turnstile?: boolean | Record<string, unknown>; email?: number } = {}) {
  const calls: FetchCall[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    const body = init?.body instanceof FormData ? JSON.stringify(Object.fromEntries(init.body as unknown as Iterable<[string, string]>)) : await req.clone().text().catch(() => '');
    calls.push({ url: req.url, method: req.method, body });
    if (req.url.startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const t = opts.turnstile ?? true;
      const payload =
        t === true
          ? { success: true, hostname: 'petition.test', action: 'sign' }
          : t === false
            ? { success: false, 'error-codes': ['invalid-input-response'] }
            : t;
      return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
    }
    if (req.url.startsWith('https://api.resend.com/') || req.url.startsWith('https://api.postmarkapp.com/')) {
      return new Response(JSON.stringify({ id: 'email-1' }), { status: opts.email ?? 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  });
  return { calls, spy };
}

/* ---------------------------------------------------------------- Access JWT */

export async function makeAccessKeys(): Promise<{ privateKey: CryptoKey; kid: string }> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const kid = `kid-${crypto.randomUUID()}`;
  await primeAccessKeys(testEnv().ACCESS_TEAM_DOMAIN, { keys: [{ ...jwk, kid }] });
  return { privateKey: pair.privateKey, kid };
}

export async function signJwt(
  privateKey: CryptoKey,
  kid: string,
  claims: Record<string, unknown> = {},
): Promise<string> {
  const e = testEnv();
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const header = enc({ alg: 'RS256', kid, typ: 'JWT' });
  const payload = enc({
    aud: [e.ACCESS_AUD],
    email: 'organizer@example.com',
    iat: now,
    exp: now + 3600,
    iss: `https://${e.ACCESS_TEAM_DOMAIN}`,
    sub: 'user-1',
    ...claims,
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64UrlEncode(sig)}`;
}

/** Admin helper bound to one valid JWT. */
export async function adminClient(email = 'organizer@example.com') {
  const { privateKey, kid } = await makeAccessKeys();
  const token = await signJwt(privateKey, kid, { email });
  const h = { 'Cf-Access-Jwt-Assertion': token };
  return {
    token,
    get: (path: string, e?: AppEnv) => call(get(path, h), e),
    post: (path: string, data: Record<string, string>, e?: AppEnv) => call(postForm(path, data, { headers: h }), e),
  };
}
