/** Response security headers (spec §9) and same-origin checks for POSTs (spec §6 step 2). */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self' https://challenges.cloudflare.com",
  "img-src 'self' data:",
  "style-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function applySecurityHeaders(headers: Headers): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
}

function hostOf(value: string | null): string | null {
  if (!value || value === 'null') return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/** Origin (or, failing that, Referer) host must equal the host the request was sent to. */
export function isSameOrigin(req: Request): boolean {
  const host = new URL(req.url).host;
  const origin = req.headers.get('Origin');
  if (origin && origin !== 'null') return hostOf(origin) === host;
  const refererHost = hostOf(req.headers.get('Referer'));
  return refererHost === host;
}
