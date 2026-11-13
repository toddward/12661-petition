# Slow Down on Victory Lakes Loop

A resident-run site for the petition asking Prince William County for speed tables on Victory Lakes Loop, under the county's Residential Traffic Management program. It is **not** an official county, VDOT or HOA site.

The build spec is [`docs/SPEC.md`](docs/SPEC.md). Product context for design work is in [`PRODUCT.md`](PRODUCT.md), and the visual system is in [`DESIGN.md`](DESIGN.md).

## What it does

- **Public site.** A landing page with progress toward 75% of occupied households, a signing form (address type-ahead with a no-JS `<select>` fallback, Turnstile, honeypot, minimum fill time), thank-you, email confirm, withdraw and unsubscribe pages, a FAQ and a privacy notice.
- **Modes.** `pledge` (launch default; support only, never counted as county signatures), `petition` (county wording, verbatim and versioned) and `closed`.
- **One signature per household.** Enforced by a partial unique index in D1. Every signature records the exact petition text version (SHA-256) it was signed under, plus IP, user agent, country and network.
- **Admin (`/admin`).** Protected by Cloudflare Access, with the JWT verified again in the Worker. It has:
  - a dashboard
  - a signature list with filters and a detail view (reject, restore, mark household vacant)
  - paper entry
  - a household CSV import with a diff preview, and bulk petition-area by street
  - petition text versions (draft, preview, publish)
  - the mode switch
  - pledge-to-petition follow-up emails
  - CSV export (Excel-safe, IP columns opt-in)
  - a county print view with the petition language on every page, plus a blank wet-ink variant
  - settings and an audit log
- **Daily retention cron.** Clears IP data after 365 days, scrubs withdrawn rows after 30 days, and deletes data after 730 days or 90 days after the county's decision. It never deletes anything under a year old while the site is open.

## Decisions still open (spec §12)

These are config, not code. Fill them in before launch:

| Decision | Where |
|---|---|
| Does PWC DOT accept electronic signatures? Stay in `pledge` mode until it does. | Admin → Mode |
| Address list source; who marks occupied/vacant; petition area once the county defines it | Admin → Households (CSV import) |
| Domain and public contact (organizer email/phone) | `SITE_URL` in `wrangler.jsonc`; Admin → Settings |
| Email on/off, provider (Resend or Postmark), sender | `EMAIL_ENABLED`, `EMAIL_PROVIDER`, `EMAIL_FROM` vars; `EMAIL_API_KEY` secret |
| Admin email addresses | Cloudflare Access policy |
| Retention periods | Admin → Settings |

Copy to keep current: the landing page says the HOA board decision is "expected on December 22" (`src/views/public/home.ts`). It makes only general claims about speeding. Real neighbor accounts can be added later, with consent.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars          # local secrets; never commit
npm run db:migrate:local                # D1 schema + default settings + launch pledge text
npm run dev                             # http://localhost:8787
```

- **Admin locally.** `/admin` opens without Cloudflare Access because `.dev.vars` sets `DEV_ADMIN_EMAIL`. That bypass only works when the host is `localhost` or `127.0.0.1`.
- **Turnstile locally.** The example vars use Cloudflare's always-pass test keys.
- **Households.** Import a CSV in Admin → Households → Import, or generate SQL:

  ```bash
  npm run import-households -- path/to/households.csv out.sql
  npx wrangler d1 execute vll-petition-db --local --file out.sql
  ```

  CSV columns: `street_number,street_name,unit,zip,in_petition_area,occupied,notes`. Never commit the household CSV or any export (`*.csv` is gitignored).

## Tests

```bash
npm test          # Vitest inside the Workers runtime (105 tests)
npm run typecheck
```

The tests cover every server-side acceptance criterion in spec §17: the check order, duplicates, crafted POSTs, Access JWT, CSV, print view, progress, withdraw, retention and headers. Lighthouse/axe runs and the real Turnstile widget need a browser against a deployed site; see the checklist below.

## Deploy

```bash
npx wrangler login
npx wrangler d1 create vll-petition-db          # paste database_id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put FORM_HMAC_KEY            # openssl rand -base64 32
npx wrangler secret put EMAIL_API_KEY            # only if EMAIL_ENABLED=true
npx wrangler deploy
```

Then:

1. **Domain.** Attach the custom domain (Workers & Pages → vll-petition → Settings → Domains & Routes), and set `SITE_URL`.
2. **Turnstile.** Create a widget for the domain (managed mode). Put its site key in `TURNSTILE_SITE_KEY`; the default in `wrangler.jsonc` is Cloudflare's test key.
3. **Access.** Create a self-hosted application for `<domain>/admin*` with an allow policy for the admin emails. Copy its AUD tag into `ACCESS_AUD` and your team domain into `ACCESS_TEAM_DOMAIN`, then redeploy.
4. **Admin setup.** In Admin → Settings, set the organizer email and phone. In Admin → Households, import the address list.
5. **Check.** Run the spec §17 checklist against production with a test household, then reject the test signature.

## Where this differs from the spec

- **Test package.** `@cloudflare/vitest-pool-workers` has been renamed to `@cloudflare/vitest-plugin`, which the project uses.
- **Added columns.** Each one is marked `ADDED` in the migration:
  - `petition_versions.published_at`
  - `signatures.entry_method` (`online` or `paper`), so a later reject cannot erase that a row came from paper
  - `signatures.followup_sent_at`
- **Launch pledge text.** It is seeded and active from the first migration, so the site works right after deploy.
- **Publishing switches the mode.** Publishing a petition-text version also switches the site to that version's mode, unless the site is closed. Switching the mode by hand requires a matching active text.
- **Unsubscribe links.** These use an HMAC of the signature id. Only token hashes are stored, and reusing the confirm/withdraw token would have broken the original withdraw link.
- **Same-origin check.** Every POST is checked (CSRF defence), not just `/sign`.
- **Paper signatures.** With `require_email_confirmation` on, paper signatures still count, since they have no email.
- **Search engines.** Public pages are indexable. Add `<meta name="robots" content="noindex">` in `src/views/layout.ts` if you'd rather keep them out of search results.
- **Not built.** The optional drawn signature (`DRAWN_SIGNATURE`) and the Spanish translation (`LANG_ES`). Both flags stay off.

## Design

The visual system ("the subdivision plat": drafting-film paper, navy pen rules, one vermilion boundary colour) was developed with the impeccable design skill. The decision trail is in `.impeccable/`: the approved comp, region spec, surface brief and build state. The plat drawing and icons in `public/img/plates/` were generated with OpenAI image models and carry their generation prompts embedded in the PNGs. The plat is an illustration and says so on the page; the county defines the real petition area. Fonts are Barlow and Barlow Semi Condensed (SIL OFL), self-hosted in `public/fonts/`.
