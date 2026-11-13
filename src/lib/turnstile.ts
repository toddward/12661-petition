/** Cloudflare Turnstile server-side verification (spec §8). */

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare's documented dummy secret keys. They return a fixed hostname, so the
 * hostname/action checks are skipped for them. Never use them in production.
 */
const DUMMY_SECRETS = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);

export interface TurnstileResult {
  ok: boolean;
  codes: string[];
}

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
  action?: string;
}

export async function verifyTurnstile(opts: {
  secret: string;
  token: string | undefined;
  remoteIp: string | null;
  expectedHostname: string;
  expectedAction?: string;
}): Promise<TurnstileResult> {
  const { secret, token, remoteIp, expectedHostname } = opts;
  const expectedAction = opts.expectedAction ?? 'sign';
  if (!token) return { ok: false, codes: ['missing-input-response'] };
  if (token.length > 2048) return { ok: false, codes: ['invalid-input-response'] };
  if (!secret) return { ok: false, codes: ['missing-input-secret'] };

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  let data: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body: form });
    if (!res.ok) return { ok: false, codes: [`siteverify-http-${res.status}`] };
    data = await res.json<SiteverifyResponse>();
  } catch {
    // Fail closed: the signer sees "Please complete the check" and the paper fallback.
    return { ok: false, codes: ['siteverify-unreachable'] };
  }

  if (!data.success) return { ok: false, codes: data['error-codes'] ?? ['unknown'] };
  if (!DUMMY_SECRETS.has(secret)) {
    if (data.hostname !== expectedHostname) return { ok: false, codes: ['hostname-mismatch'] };
    if (data.action !== expectedAction) return { ok: false, codes: ['action-mismatch'] };
  }
  return { ok: true, codes: [] };
}
