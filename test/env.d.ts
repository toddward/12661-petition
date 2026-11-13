import type { D1Migration } from 'cloudflare:test';
import type { AppEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
export {};
