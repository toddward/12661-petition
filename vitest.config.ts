import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SITE_URL: 'https://petition.test',
            TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
            FORM_HMAC_KEY: 'test-hmac-key-0123456789abcdef0123456789',
            ACCESS_TEAM_DOMAIN: 'vll-test.cloudflareaccess.com',
            ACCESS_AUD: 'test-aud-tag',
            EMAIL_ENABLED: 'true',
            EMAIL_PROVIDER: 'resend',
            EMAIL_FROM: 'Petition <petition@petition.test>',
            EMAIL_API_KEY: 'test-email-key',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.ts'],
    },
  };
});
