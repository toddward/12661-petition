/**
 * Cloudflare Access JWT verification (spec §10.1, defence in depth).
 * Access already blocks /admin at the edge; the Worker re-checks the
 * Cf-Access-Jwt-Assertion header on every admin request.
 */
import { base64UrlDecode } from './crypto';

interface Jwk extends JsonWebKey {
  kid?: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

export interface AccessClaims {
  aud?: string | string[];
  email?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  iss?: string;
  sub?: string;
}

export type AccessResult = { ok: true; email: string; claims: AccessClaims } | { ok: false; reason: string };

const CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_REFETCH_MS = 30 * 1000;
const CLOCK_SKEW_S = 60;

interface KeyCache {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}
const caches = new Map<string, KeyCache>();

function certsUrl(teamDomain: string): string {
  const host = teamDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${host}/cdn-cgi/access/certs`;
}

function issuer(teamDomain: string): string {
  return `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
}

async function importKeys(jwks: { keys?: Jwk[] }): Promise<Map<string, CryptoKey>> {
  const out = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys ?? []) {
    if (!jwk.kid || jwk.kty !== 'RSA') continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    out.set(jwk.kid, key);
  }
  return out;
}

/** Test hook: seed the key cache so tests need no network. */
export async function primeAccessKeys(teamDomain: string, jwks: { keys: Jwk[] }): Promise<void> {
  caches.set(teamDomain, { keys: await importKeys(jwks), fetchedAt: Date.now() });
}

export function clearAccessKeys(): void {
  caches.clear();
}

async function getKey(teamDomain: string, kid: string): Promise<CryptoKey | null> {
  const now = Date.now();
  const cached = caches.get(teamDomain);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS && cached.keys.has(kid)) return cached.keys.get(kid)!;
  // Unknown kid (key rotation) or stale cache: refetch, but not more than every 30 s.
  if (cached && now - cached.fetchedAt < MIN_REFETCH_MS) return cached.keys.get(kid) ?? null;
  const res = await fetch(certsUrl(teamDomain));
  if (!res.ok) return cached?.keys.get(kid) ?? null;
  const keys = await importKeys(await res.json<{ keys?: Jwk[] }>());
  caches.set(teamDomain, { keys, fetchedAt: now });
  return keys.get(kid) ?? null;
}

function decodeJson<T>(segment: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
  } catch {
    return null;
  }
}

export async function verifyAccessJwt(
  token: string | null | undefined,
  opts: { teamDomain: string; audience: string; nowSeconds?: number },
): Promise<AccessResult> {
  if (!token) return { ok: false, reason: 'missing' };
  if (!opts.teamDomain || opts.teamDomain.includes('<') || !opts.audience || opts.audience.includes('<'))
    return { ok: false, reason: 'access-not-configured' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [h, p, s] = parts as [string, string, string];
  const header = decodeJson<JwtHeader>(h);
  const claims = decodeJson<AccessClaims>(p);
  if (!header || !claims) return { ok: false, reason: 'malformed' };
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'bad-alg' };

  let key: CryptoKey | null;
  try {
    key = await getKey(opts.teamDomain, header.kid);
  } catch {
    return { ok: false, reason: 'certs-unavailable' };
  }
  if (!key) return { ok: false, reason: 'unknown-kid' };

  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlDecode(s);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    sigBytes,
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) return { ok: false, reason: 'bad-signature' };

  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!aud.includes(opts.audience)) return { ok: false, reason: 'bad-aud' };
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) return { ok: false, reason: 'expired' };
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > now) return { ok: false, reason: 'not-yet-valid' };
  if (claims.iss && claims.iss !== issuer(opts.teamDomain)) return { ok: false, reason: 'bad-iss' };
  if (!claims.email) return { ok: false, reason: 'no-email' };

  return { ok: true, email: claims.email.toLowerCase(), claims };
}
