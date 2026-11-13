const encoder = new TextEncoder();

export function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}

/** 32 random bytes, base64url. Used for confirm/withdraw tokens (spec §7). */
export function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret);
  return base64UrlEncode(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function hmacVerify(secret: string, message: string, signature: string): Promise<boolean> {
  return timingSafeEqual(await hmacSign(secret, message), signature);
}

/* ---------- form_started_at (spec §4.2, §6 step 4) ---------- */

const FORM_TOKEN_PREFIX = 'v1';

/** Server-signed timestamp placed in a hidden field when the form is rendered. */
export async function issueFormToken(secret: string, nowMs: number = Date.now()): Promise<string> {
  const payload = `${FORM_TOKEN_PREFIX}.${nowMs}`;
  return `${payload}.${await hmacSign(secret, payload)}`;
}

export type FormTokenCheck = { ok: true; ageMs: number } | { ok: false; reason: 'invalid' | 'too_fast' | 'expired' };

export const FORM_MIN_MS = 3_000;
export const FORM_MAX_MS = 2 * 60 * 60 * 1000;

export async function checkFormToken(
  secret: string,
  token: string | undefined,
  nowMs: number = Date.now(),
): Promise<FormTokenCheck> {
  if (!token) return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== FORM_TOKEN_PREFIX) return { ok: false, reason: 'invalid' };
  const [prefix, ts, sig] = parts as [string, string, string];
  if (!/^\d{10,16}$/.test(ts)) return { ok: false, reason: 'invalid' };
  if (!(await hmacVerify(secret, `${prefix}.${ts}`, sig))) return { ok: false, reason: 'invalid' };
  const ageMs = nowMs - Number(ts);
  if (ageMs < FORM_MIN_MS) return { ok: false, reason: 'too_fast' };
  if (ageMs > FORM_MAX_MS) return { ok: false, reason: 'expired' };
  return { ok: true, ageMs };
}

/* ---------- unsubscribe links (spec §7 follow-ups) ---------- */

/**
 * Stateless unsubscribe token for a signature row. Only token hashes are stored, so the
 * follow-up email cannot reuse the confirm/withdraw token; an HMAC keeps that link working.
 */
export async function unsubscribeToken(secret: string, signatureId: string): Promise<string> {
  return hmacSign(secret, `unsubscribe:${signatureId}`);
}

export async function checkUnsubscribeToken(secret: string, signatureId: string, token: string): Promise<boolean> {
  return hmacVerify(secret, `unsubscribe:${signatureId}`, token);
}
