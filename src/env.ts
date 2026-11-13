/** Minimal shape of a Workers Rate Limiting binding. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Bindings, vars and secrets available to the Worker (see wrangler.jsonc). */
export interface AppEnv {
  DB: D1Database;
  ASSETS?: Fetcher;
  SUBMIT_LIMITER?: RateLimiter;
  SEARCH_LIMITER?: RateLimiter;

  SITE_URL: string;
  TURNSTILE_SITE_KEY: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  EMAIL_ENABLED: string;
  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  DRAWN_SIGNATURE?: string;
  LANG_ES?: string;

  // Secrets
  TURNSTILE_SECRET_KEY: string;
  FORM_HMAC_KEY: string;
  EMAIL_API_KEY?: string;

  // Local development only (.dev.vars); honoured only on localhost.
  DEV_ADMIN_EMAIL?: string;
}

export type Mode = 'pledge' | 'petition';
export type SiteMode = Mode | 'closed';

/** Hono generics for this app. */
export interface AppBindings {
  Bindings: AppEnv;
  Variables: {
    adminEmail: string;
  };
}

export function flag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}
