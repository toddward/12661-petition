import { Hono } from 'hono';
import type { AppBindings, AppEnv } from './env';
import { verifyAccessJwt } from './lib/access';
import { runRetention } from './lib/retention';
import { applySecurityHeaders, isSameOrigin } from './lib/security';
import { DEFAULT_SETTINGS, getSettings, type Settings } from './lib/settings';
import { adminRoutes } from './routes/admin';
import { publicRoutes } from './routes/public';
import { errorPage } from './views/public/pages';

const app = new Hono<AppBindings>();

/* Security headers on every Worker response (static assets get them from public/_headers). */
app.use('*', async (c, next) => {
  await next();
  // Copy so headers are mutable even for cached responses.
  c.res = new Response(c.res.body, c.res);
  applySecurityHeaders(c.res.headers);
});

function isAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
}

async function settingsOrDefault(db: D1Database): Promise<Settings> {
  try {
    return await getSettings(db);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/*
 * Same-origin check for every state-changing request (CSRF defence).
 * POST /sign does its own check after the rate limit, as spec §6 orders it.
 */
app.use('*', async (c, next) => {
  const m = c.req.method;
  if (m !== 'GET' && m !== 'HEAD' && c.req.path !== '/sign' && !isSameOrigin(c.req.raw)) {
    const s = await settingsOrDefault(c.env.DB);
    return c.html(errorPage(s, 403, 'Request blocked', 'This form must be sent from this website. Please go back, reload the page and try again.'), 403);
  }
  await next();
});

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Returns the verified admin email, or null. */
export async function authenticateAdmin(req: Request, env: AppEnv): Promise<string | null> {
  const url = new URL(req.url);
  if (env.DEV_ADMIN_EMAIL && LOCAL_HOSTS.has(url.hostname)) return env.DEV_ADMIN_EMAIL;
  const result = await verifyAccessJwt(req.headers.get('Cf-Access-Jwt-Assertion'), {
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUD,
  });
  if (!result.ok) {
    console.warn('admin access denied', result.reason);
    return null;
  }
  return result.email;
}

/* Admin: Cloudflare Access protects /admin at the edge; the Worker verifies the JWT too (spec §10.1). */
app.use('*', async (c, next) => {
  if (!isAdminPath(c.req.path)) return next();
  const email = await authenticateAdmin(c.req.raw, c.env);
  if (!email) {
    c.header('Cache-Control', 'no-store');
    return c.text('Forbidden: sign in through Cloudflare Access to use the admin area.', 403);
  }
  c.set('adminEmail', email);
  await next();
  c.res.headers.set('Cache-Control', 'no-store');
});

app.route('/', publicRoutes);
app.route('/', adminRoutes);

app.notFound(async (c) => {
  const s = await settingsOrDefault(c.env.DB);
  return c.html(errorPage(s, 404, 'Page not found', 'We could not find that page.'), 404);
});

app.onError(async (err, c) => {
  console.error('unhandled error', err instanceof Error ? (err.stack ?? err.message) : String(err));
  const s = await settingsOrDefault(c.env.DB);
  return c.html(
    errorPage(s, 500, 'Something went wrong', 'Sorry, something went wrong on our side. Please try again in a few minutes, or contact the organizer.'),
    500,
  );
});

export { app };

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: AppEnv, ctx: ExecutionContext): Promise<void> {
    const bucket = (env as AppEnv & { SIG_BUCKET?: R2Bucket }).SIG_BUCKET;
    ctx.waitUntil(runRetention(env.DB, new Date(controller.scheduledTime), { bucket }).then(() => undefined));
  },
} satisfies ExportedHandler<AppEnv>;
