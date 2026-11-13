# Victory Lakes Loop Speed Table Petition Site: Build Spec

Version 1.0, November 9, 2026
Owner: Todd Wardzinski (resident organizer)
Target: Cloudflare Workers (Static Assets + D1 + Turnstile + Cloudflare Access), deployed with Wrangler
Audience: a coding agent or developer building the site from scratch. Nothing in this spec has been built or deployed.

---

## 0. Read this first: what the site can and cannot do

The site supports a resident petition asking Prince William County (PWC) to install physical traffic calming (speed tables) on Victory Lakes Loop, under the county's Residential Traffic Management program. The county's rules shape the whole design.

What the county requires (source: *2025 PWC Residential Traffic Management Guide*, pwcva.gov, and the PWC DOT flyer *Reduce Speeding in Your Neighborhood*):

| Rule | What the county says | Effect on this site |
|---|---|---|
| Threshold | At least **75% of occupied households** in the impacted area must sign for physical measures (Guide p.8, p.11). | Progress is measured per household against a configurable count of occupied households in the petition area. |
| One per household | "One signature per household, which can be a renter" (Guide p.11). | Hard uniqueness on household. Owners and renters may both sign; record which. |
| Petition area | **The county**, with the District Supervisor's office, defines the petition area. It "encompasses residences on the proposed street section under study, and all streets that have access to it" (Guide p.11). | The eligible address list is data, not code. It must be editable by the admin once the county defines the area. Do not hard-code "Victory Lakes Loop only" or "whole HOA". |
| Form and wording | County staff provide the petition to a community representative (Guide p.8); PWC DOT and the Supervisor's office "assist in providing petition forms" (Guide p.10). Every page must carry **dated signatures and the petition language** (Guide p.11). | Petition text is versioned content loaded from the database, and each signature records the exact version it was signed under. The print/export view repeats the petition language on every page. |
| Timing | The petition is circulated **after** the speed study and plan, and "should not be circulated until it is verified that the street(s) meet the eligibility requirements" (Guide p.10). | The site has two modes: **Pledge** (support only, before the county issues the petition) and **Petition** (formal signatures using county wording). |
| Validity | Petitions "are valid for a period of 12 months" (Guide p.11). | Store signature dates; show the age of the oldest signature in admin; retention rules key off this. |
| Verification | "PWC DOT will verify that the petition is valid" before forwarding to VDOT (Guide p.11). Method not stated. | Exports must be clean and complete enough for county verification. |
| HOA alternative | "In certain instances", an HOA board resolution "can be accepted in lieu of a petition" (Guide p.11). | If the HOA board passes a resolution, the formal petition may not be needed. Pledge mode is still useful as evidence of support. |
| Electronic signatures | **Neither county document says** whether online or electronic signatures are accepted. | Open question for PWC DOT (see §12). The site must work either way: if the county wants its own paper form, the site becomes a sign-up and tracking tool that produces a printable, pre-filled list for wet-ink signing. |

What the site cannot do on its own:
- It cannot make a signature count toward the county's 75%. Only PWC DOT decides whether an online signature is valid.
- It cannot define the petition area. The county does.
- It cannot verify identity or occupancy beyond address matching, attestation and optional email confirmation.

The site must not present itself as an official county, VDOT or HOA site. It is a resident-run site. No county or HOA logos.

---

## 1. Goals and non-goals

Goals
1. Let a resident of an eligible household sign (or pledge) in under two minutes on a phone, reached from a QR code on a mailer.
2. Enforce one active signature per household.
3. Capture for each submission: name, address, email, optional phone, owner/renter, attestations, typed signature, timestamp, IP address, user agent.
4. Show public progress toward 75% of occupied households, without revealing who signed.
5. Give the organizer an authenticated admin view with review tools and CSV/print export in a county-ready layout.
6. Tell signers clearly what is collected, why, who sees it and how long it is kept, including the IP address.

Non-goals
- No payments, no user accounts for signers, no social login.
- No public list of signers.
- No analytics or third-party trackers (Turnstile is the only third-party script).
- No mass email features beyond the single confirmation email per signature.

---

## 2. Architecture

```
Browser ──HTTPS──> Cloudflare Worker (petition-site)
                     ├─ Static assets (CSS, JS, images) via Workers Static Assets
                     ├─ Server-rendered HTML (TypeScript, Hono router)
                     ├─ D1 database  (binding: DB)
                     ├─ Rate limiting binding (SUBMIT_LIMITER, SEARCH_LIMITER)
                     ├─ Turnstile (server-side verify via siteverify API)
                     ├─ Optional email provider (confirmation emails) via fetch
                     └─ Cron trigger (daily) for retention purges
/admin/*  ── protected by Cloudflare Access (Zero Trust), JWT verified in the Worker too
```

Stack
- Language: TypeScript.
- Router: Hono (small, Workers-native). Plain `fetch` handler is acceptable if preferred.
- Rendering: server-rendered HTML with progressive enhancement. Forms must submit and work without JavaScript, except Turnstile (see §8 fallback).
- Storage: **D1** (SQLite). Relational constraints are needed for the one-per-household rule, so do not use KV for signatures. KV is not needed.
- Optional R2: only if drawn signatures are enabled (§4.3). Default is off.
- Tests: Vitest with `@cloudflare/vitest-pool-workers`.

Cost: everything fits Cloudflare's free tiers at this scale (a few hundred households). Cloudflare Access is free for up to 50 users.

---

## 3. Modes

A single setting `SITE_MODE` (stored in the `settings` table, editable in admin) controls behaviour.

| Mode | Purpose | Wording on site | Counts toward county 75%? |
|---|---|---|---|
| `pledge` (default at launch) | Gather support before the county issues the petition, and before or after the HOA board's December 22 decision. | "I support speed tables on Victory Lakes Loop and will sign the county's petition when it is available." | No. Clearly labelled as a pledge. |
| `petition` | Collect signatures under the county-issued petition language. | County petition language, verbatim, from `petition_versions`. | Only if PWC DOT accepts electronic signatures (§12). |
| `closed` | Petition submitted or campaign ended. | "Thank you. Signatures are closed." Progress shown as final. | n/a |

Switching from `pledge` to `petition` must **not** convert pledges into signatures. The site emails pledgers (only those who opted in) asking them to sign the formal petition. A pledge household is shown in admin as "pledged, not yet signed".

---

## 4. Pages and form fields

### 4.1 Public pages

| Route | Method | Description |
|---|---|---|
| `/` | GET | Landing page. Why this matters (child safety, permanently reducing high speeds), what is being asked (physical speed tables through the county program), how the process works (HOA board, county speed study, petition, county approval), progress bar, "Sign" button, organizer contact. |
| `/sign` | GET | Signing form (§4.2). |
| `/sign` | POST | Submit. On success redirect (303) to `/thanks`. On validation error, re-render the form with errors and entered values preserved. |
| `/thanks` | GET | Confirmation. Tells the signer what happens next, how to withdraw, and that a confirmation email is on its way (if email is enabled). |
| `/confirm` | GET | `?token=` email confirmation link. Marks email confirmed. |
| `/withdraw` | GET/POST | `?token=` from the confirmation email. Shows the signature summary (name, address, date) and a Withdraw button. POST withdraws. |
| `/privacy` | GET | Full privacy notice (§9). |
| `/faq` | GET | Short FAQ: who runs this, is it official (no), why IP is logged, what renters can do, what if someone in my house already signed, paper option. |
| `/api/address-search` | GET | `?q=` (min 2 chars). Returns up to 10 matching eligible addresses as `{id, label}`. Must never reveal whether an address has signed. Rate limited. |
| `/api/progress` | GET | `{signed, occupied_total, percent, goal_percent: 75, mode, updated_at}`. Cache 60 s at the edge. |

### 4.2 Signing form fields

| Field | Type | Required | Validation / notes |
|---|---|---|---|
| Address | Combobox (type-ahead against `/api/address-search`), stores `household_id` | Yes | Must match a row in `households` where `in_petition_area = 1` and `active = 1`. Free-text addresses are rejected. No-JS fallback: a `<select>` grouped by street. |
| Full name | Text | Yes | 2 to 100 chars, trimmed, letters, spaces, `'`, `-`, `.`. |
| Email | Email | Yes | RFC-reasonable syntax, max 254, lowercased. Used for confirmation and withdraw link only. |
| Phone | Tel | No | Digits only after normalisation, 10 digits (US). Optional; explain it is only for the organizer to follow up. |
| Relationship to home | Radio: Owner / Renter / Other adult resident | Yes | County allows renters. Stored as `owner`, `renter`, `resident`. |
| I am 18 or older | Checkbox | Yes | Attestation. |
| I live at this address and am signing on behalf of my household | Checkbox | Yes | Attestation. Text must be shown next to the box exactly as stored in `petition_versions.attestation_text`. |
| Typed signature | Text | Yes | Must equal "Full name" ignoring case and extra whitespace. Labelled "Type your full name as your signature". |
| Petition statement | Read-only block above the form | n/a | Full text of the active petition version. In pledge mode, the pledge text. |
| Keep me updated about the county petition | Checkbox | No | Default unchecked. Required for any follow-up email beyond the confirmation. |
| Turnstile | Widget | Yes | See §8. |
| Hidden: `petition_version_id` | Hidden | Yes | Must equal the currently active version, else re-render with "The petition text was updated, please review and sign again." |
| Hidden: `form_started_at` | Hidden | Yes | Server-signed timestamp (HMAC). Reject submissions faster than 3 s (bot signal). |

Under the submit button, a short notice (full text in §9.1):
> When you sign, we record your name, address, email, optional phone, the date and time, and your internet (IP) address and browser type. This is used only to run and verify this petition. [Privacy notice]

### 4.3 Optional drawn signature (feature flag `DRAWN_SIGNATURE`, default off)

If the county asks for a handwritten-style signature, enable a canvas signature pad. Store the PNG in R2 under `signatures/{signature_id}.png` (max 100 KB), and the R2 key in `signatures.drawn_signature_key`. Typed signature remains required. Keep this off unless the county asks for it.

### 4.4 Duplicate household behaviour

If the selected household already has an active signature:
- Do not create a second signature.
- Show: "Someone at this address has already signed. The county counts one signature per household. If you believe this is a mistake, contact the organizer."
- Do not reveal the existing signer's name.
- Log the attempt in `submission_log` with event `duplicate_household`.

---

## 5. Data model (D1)

Use D1 migrations (`migrations/0001_init.sql`, etc.). All timestamps are UTC ISO 8601 strings. IDs are UUIDv4 strings (`crypto.randomUUID()`).

```sql
CREATE TABLE households (
  id               TEXT PRIMARY KEY,
  street_number    TEXT NOT NULL,
  street_name      TEXT NOT NULL,
  unit             TEXT,
  city             TEXT NOT NULL DEFAULT 'Bristow',
  state            TEXT NOT NULL DEFAULT 'VA',
  zip              TEXT NOT NULL,
  label            TEXT NOT NULL,          -- display, e.g. "12345 Victory Lakes Loop"
  normalized       TEXT NOT NULL UNIQUE,   -- lowercased, abbreviations expanded, for search and dedupe
  in_petition_area INTEGER NOT NULL DEFAULT 0,  -- 1 once county defines area
  occupied         INTEGER NOT NULL DEFAULT 1,  -- 0 = vacant, excluded from denominator
  active           INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_households_search ON households(normalized);

CREATE TABLE petition_versions (
  id                TEXT PRIMARY KEY,
  mode              TEXT NOT NULL CHECK (mode IN ('pledge','petition')),
  title             TEXT NOT NULL,
  body_markdown     TEXT NOT NULL,        -- verbatim county language in petition mode
  attestation_text  TEXT NOT NULL,
  sha256            TEXT NOT NULL,        -- hash of title + body + attestation
  source_note       TEXT,                 -- e.g. "Text provided by PWC DOT, email of <date>"
  active            INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);
-- Exactly one active version at a time (enforce in app + partial unique index)
CREATE UNIQUE INDEX one_active_version ON petition_versions(active) WHERE active = 1;

CREATE TABLE signatures (
  id                   TEXT PRIMARY KEY,
  household_id         TEXT NOT NULL REFERENCES households(id),
  petition_version_id  TEXT NOT NULL REFERENCES petition_versions(id),
  mode                 TEXT NOT NULL CHECK (mode IN ('pledge','petition')),
  full_name            TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  relationship         TEXT NOT NULL CHECK (relationship IN ('owner','renter','resident')),
  attest_adult         INTEGER NOT NULL CHECK (attest_adult = 1),
  attest_resident      INTEGER NOT NULL CHECK (attest_resident = 1),
  typed_signature      TEXT NOT NULL,
  drawn_signature_key  TEXT,
  updates_opt_in       INTEGER NOT NULL DEFAULT 0,
  signed_at            TEXT NOT NULL,
  email_confirmed_at   TEXT,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','withdrawn','rejected')),
  status_reason        TEXT,
  status_changed_at    TEXT,
  token_hash           TEXT NOT NULL,      -- SHA-256 of confirm/withdraw token; raw token only in the email
  -- submission snapshot (the "IP logging" requirement)
  ip_address           TEXT,               -- from CF-Connecting-IP; NULLed by retention job
  user_agent           TEXT,               -- truncated to 512 chars; NULLed by retention job
  cf_country           TEXT,               -- request.cf.country
  cf_asn               INTEGER,            -- request.cf.asn
  flags                TEXT                -- JSON array of review flags, e.g. ["shared_ip","email_reused"]
);
-- One active signature per household per mode
CREATE UNIQUE INDEX one_active_per_household
  ON signatures(household_id, mode) WHERE status = 'active';
CREATE INDEX idx_signatures_email ON signatures(email);
CREATE INDEX idx_signatures_ip ON signatures(ip_address);

CREATE TABLE submission_log (
  id            TEXT PRIMARY KEY,
  event         TEXT NOT NULL,   -- sign_ok, duplicate_household, invalid_address, turnstile_fail,
                                 -- rate_limited, too_fast, version_mismatch, withdraw, confirm_email
  signature_id  TEXT,
  household_id  TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  cf_country    TEXT,
  detail        TEXT,            -- short JSON, never the full form body
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_log_created ON submission_log(created_at);

CREATE TABLE admin_audit (
  id           TEXT PRIMARY KEY,
  admin_email  TEXT NOT NULL,    -- from the verified Access JWT
  action       TEXT NOT NULL,    -- export_csv, print, reject, restore, edit_household, import_households,
                                 -- set_mode, publish_version, purge
  target       TEXT,
  detail       TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
-- seed: site_mode=pledge, goal_percent=75, occupied_override (optional integer),
--       organizer_name, organizer_email, retention_days_ip=365, retention_days_all=730
```

Progress calculation:
```
signed         = COUNT(DISTINCT household_id) FROM signatures
                 WHERE status='active' AND mode=<current mode>
                 AND household_id IN (in_petition_area=1 AND occupied=1 AND active=1)
occupied_total = settings.occupied_override if set, else
                 COUNT(*) FROM households WHERE in_petition_area=1 AND occupied=1 AND active=1
percent        = floor(signed * 1000 / occupied_total) / 10
```
Show "X of Y households, Z%. Goal: 75%". Hide the bar and show "Progress will appear once the petition area is set" while `occupied_total = 0`.

---

## 6. Validation and dedupe rules (server side, all mandatory)

Order of checks on `POST /sign`:
1. Rate limit by IP (`SUBMIT_LIMITER`, 5 per 60 s). Fail: HTTP 429 page, log `rate_limited`.
2. Origin check: `Origin` or `Referer` host must equal the site host. Fail: 403.
3. Turnstile siteverify (§8). Fail: re-render with "Please complete the check", log `turnstile_fail`.
4. `form_started_at` HMAC valid and older than 3 s, younger than 2 h. Fail: log `too_fast` or re-render.
5. `petition_version_id` equals the active version. Fail: re-render, log `version_mismatch`.
6. `SITE_MODE` is not `closed`.
7. Field validation per §4.2. Typed signature equals full name (case and whitespace insensitive).
8. Household exists, `active=1`, `in_petition_area=1`. Fail: "This address isn't in the petition area. If you think that's wrong, contact the organizer." Log `invalid_address`.
   - Exception: while no household has `in_petition_area=1` (area not yet defined), accept any `active=1` household in the seeded HOA list. In pledge mode only.
9. Insert inside a single D1 statement relying on the partial unique index. On unique-constraint error, handle as §4.4.
10. Soft flags (stored in `signatures.flags`, never blocking):
    - `shared_ip`: same IP already used for 3+ active signatures in 24 h.
    - `email_reused`: same email used for another household's active signature.
    - `name_reused`: same normalized name at another household.
    - `non_us`: `cf_country` not `US`.
11. Write `submission_log` row `sign_ok`.
12. Send confirmation email (§7) via `ctx.waitUntil` so the response is not delayed.

Input hygiene: trim all strings, strip control characters, enforce max lengths, escape all output in templates (no raw HTML from the DB except sanitized petition Markdown rendered with a strict allow-list).

Address normalisation (`normalized` column and search): lowercase; collapse whitespace; expand `ln→lane`, `lp`/`loop` kept as `loop`, `dr→drive`, `ct→court`, `rd→road`, `st→street`; remove punctuation. Search uses `LIKE ?%` on `normalized` and on `street_number || ' ' || street_name`.

---

## 7. Email (feature flag `EMAIL_ENABLED`)

- One transactional email per signature: "Thanks for signing", with the signer's name, address, date, mode (pledge or petition), a confirm link, and a withdraw link.
- Tokens: 32 random bytes, base64url. Store only the SHA-256 hash. Links: `/confirm?token=…` and `/withdraw?token=…`. Tokens do not expire before the retention purge.
- Provider: a transactional email API called with `fetch` (for example Resend or Postmark), key in a Wrangler secret `EMAIL_API_KEY`. Sender: an address on the site's domain with SPF/DKIM set. Provider choice is Todd's (§12).
- Whether an unconfirmed email still counts is a setting `require_email_confirmation` (default `false`, so older residents are not lost; unconfirmed rows are shown in admin).
- If `EMAIL_ENABLED=false`, the thanks page shows the withdraw instructions as "contact the organizer".
- Follow-up emails (pledge to petition switch) are sent only to `updates_opt_in = 1`, manually triggered from admin, one per household, with an unsubscribe link.

---

## 8. Spam and abuse protection

- **Cloudflare Turnstile** on `/sign` (managed mode). Verify server-side against `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET_KEY` (secret) and the `CF-Connecting-IP` as `remoteip`. Check `success`, `hostname`, and `action = "sign"`.
- Workers Rate Limiting bindings: `SUBMIT_LIMITER` (5 per 60 s per IP) and `SEARCH_LIMITER` (30 per 60 s per IP).
- Honeypot field (`website`, visually hidden, `tabindex=-1`, `autocomplete=off`). Non-empty: silently show the thanks page, do not store, log `honeypot`.
- Minimum fill time (§6 step 4).
- No-JS / Turnstile failure fallback: a line on the form, "Having trouble? Email or call the organizer and we'll help you sign on paper." Paper signatures are entered by the admin (§10) with `relationship`, date signed on paper, and `entered_by_admin` noted in `status_reason`.

---

## 9. Privacy and consent

### 9.1 Short notice (on the form, above Submit)

> **What we collect and why.** When you sign, this site records your name, address, email, phone (if you give it), whether you own or rent, the date and time, and the internet (IP) address and browser type your submission came from. We use this only to run this petition, to prevent duplicate or fake signatures, and, if the county accepts it, to submit the petition to Prince William County. We never sell it or use it for anything else. Your name is never shown publicly. [Read the full privacy notice]

### 9.2 Full privacy notice (`/privacy`): required content

1. **Who runs this site:** Todd Wardzinski, a Victory Lakes resident, not the HOA, not Prince William County, not VDOT. Contact: `{organizer_email}`.
2. **What is collected:** each field in §4.2, plus IP address, browser user agent, approximate country and network (from Cloudflare), and the time of submission.
3. **Why the IP address is collected:** to detect duplicate, automated or fraudulent submissions and to keep an audit record of when and from where each signature was submitted.
4. **Who can see it:** the organizer (and any co-organizer listed). If the petition is submitted, the county (PWC DOT) and, through it, VDOT and the Board of County Supervisors receive names, addresses, dates and signatures. Petition records submitted to a government body may become public records. IP addresses and emails are **not** included in the county submission unless the county requests them for verification.
5. **Service providers:** Cloudflare (hosting, database, bot checks) and the email provider, if used.
6. **How long it is kept:** IP addresses and browser details are deleted after `retention_days_ip` (default 365 days, the county petition's 12-month validity). All signature data is deleted after `retention_days_all` (default 730 days) or 90 days after the county's final decision, whichever comes first. Withdrawn signatures: personal fields are cleared after 30 days, keeping only household, dates and status for the audit trail.
7. **Your choices:** withdraw any time with the link in your email or by contacting the organizer; ask for a copy or correction of your data.
8. **Cookies:** no tracking cookies. Turnstile may set a cookie needed for the bot check. Admin pages use Cloudflare Access cookies.
9. **Last updated** date.

Implementation notes
- Do not add Google Analytics, Meta pixels, or any third-party font or script other than Turnstile. Self-host fonts or use system fonts.
- Response headers on every page: `Content-Security-Policy` (`default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` denying camera, mic, geolocation.

---

## 10. Admin area (`/admin/*`)

### 10.1 Authentication
- Protect `/admin/*` and `/api/admin/*` with a **Cloudflare Access** self-hosted application. Policy: allow only the email addresses listed in Todd's decision (§12), one-time PIN or identity provider login.
- Defense in depth: the Worker must also verify the `Cf-Access-Jwt-Assertion` header on every admin request (signature against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, `aud` equals the Access application AUD tag from env var `ACCESS_AUD`, `exp` valid). Reject with 403 if missing or invalid. Use the JWT `email` claim for `admin_audit`.
- Admin responses: `Cache-Control: no-store`.

### 10.2 Features
| Feature | Details |
|---|---|
| Dashboard | Progress (signed / occupied / %), counts by mode, by status, by relationship, unconfirmed emails, flagged rows, oldest active signature date and days remaining until 12 months. |
| Signature list | Sortable, filterable (status, mode, flagged, street, date range). Shows name, address, date, relationship, email confirmed, flags. IP and user agent visible on a detail view only. |
| Review actions | Reject (reason required), restore, mark household vacant. Every action writes `admin_audit`. No hard deletes from the UI except the retention purge. |
| Paper entry | Add a signature from a paper form: household, name, relationship, date signed, note "paper". IP fields left NULL. |
| Households | Import CSV (columns: `street_number,street_name,unit,zip,in_petition_area,occupied,notes`), edit a row, toggle `in_petition_area` / `occupied`, bulk set petition area by street name. Show a diff before applying an import. |
| Petition text | Create a new `petition_versions` row (title, body, attestation, source note), preview, publish (sets active, deactivates the old one). Published versions are immutable. |
| Mode | Switch `pledge` / `petition` / `closed` with a confirmation dialog. |
| Export CSV | `GET /admin/export.csv?mode=&status=active&include_ip=0`. Columns: `household_address, full_name, relationship, signed_at_local (America/New_York), typed_signature, email, phone, email_confirmed, petition_version_sha256, status`, plus `ip_address, user_agent, cf_country` only when `include_ip=1`. UTF-8 with BOM for Excel. Filename `petition-{mode}-{YYYYMMDD}.csv`. Neutralise CSV formula injection (prefix `'` to cells starting with `= + - @`). |
| Print view | `GET /admin/print?mode=petition`: printer-friendly pages, **petition title and full petition language at the top of every page**, then a table of household address, printed name, typed signature, relationship, date signed. Page numbers "Page X of Y". This is the layout most likely to satisfy Guide p.11. A blank-row variant (`?blank=1`) prints the same header with empty rows for wet-ink signing, pre-filled with addresses from the petition area that have not signed. |
| Audit log | Read-only list of `admin_audit` and recent `submission_log`. |

---

## 11. Accessibility, mobile and content

- WCAG 2.1 AA. Every input has a visible `<label>`; errors are linked with `aria-describedby` and summarised at the top of the form with focus moved there.
- Combobox follows the WAI-ARIA combobox pattern; the `<select>` fallback works without JS.
- Minimum 16 px body text, 44 × 44 px touch targets, contrast ≥ 4.5:1, visible focus states, respects `prefers-reduced-motion` and `prefers-color-scheme`.
- Mobile-first layout, single column, works at 320 px wide. The mailer QR code points to `/?src=mailer` (store `src` in `submission_log.detail` only, no tracking cookie).
- Plain-language copy at about an 8th-grade reading level. Landing copy covers: why (children walking to and waiting for school buses, near misses, repeated speeding), what (physical speed tables through the county program, not signs), how the county process works, that the organizer is happy to talk in person, and the organizer's contact.
- Page weight under 150 KB excluding Turnstile. No images required; an optional simple map of the road as inline SVG.
- Optional (flag `LANG_ES`): Spanish translation of public pages.

---

## 12. Decisions Todd needs to make (placeholders in config until decided)

1. **Electronic signatures:** ask PWC DOT whether they accept online signatures with the county's petition language, or require their own paper form. Until answered, launch in `pledge` mode only.
2. **Address list:** where the household list comes from (HOA directory or county property records), and who marks occupied/vacant. The county defines the petition area later; the mailer goes to the whole HOA but only petition-area households count.
3. **Domain and contact:** the site's domain name, and the organizer name and email shown publicly and on the sender address.
4. **Email confirmation:** on or off, provider, and whether unconfirmed signatures count.
5. **Admin access:** which email addresses may sign in to `/admin` (Todd, Renee, a neighbor co-organizer?).
6. **Retention periods:** accept defaults (IP 365 days, everything 730 days or 90 days after the county decision) or change them.

---

## 13. Configuration

`wrangler.jsonc` (illustrative; replace IDs after creation):

```jsonc
{
  "name": "vll-petition",
  "main": "src/index.ts",
  "compatibility_date": "2026-11-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./public", "binding": "ASSETS" },
  "d1_databases": [
    { "binding": "DB", "database_name": "vll-petition-db", "database_id": "<filled by wrangler d1 create>" }
  ],
  "ratelimits": [
    { "name": "SUBMIT_LIMITER", "namespace_id": "1001", "simple": { "limit": 5,  "period": 60 } },
    { "name": "SEARCH_LIMITER", "namespace_id": "1002", "simple": { "limit": 30, "period": 60 } }
  ],
  "triggers": { "crons": ["17 7 * * *"] },
  "vars": {
    "SITE_URL": "https://<domain>",
    "TURNSTILE_SITE_KEY": "<public site key>",
    "ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com",
    "ACCESS_AUD": "<access app aud tag>",
    "EMAIL_ENABLED": "false",
    "DRAWN_SIGNATURE": "false",
    "LANG_ES": "false"
  }
  // "r2_buckets": [{ "binding": "SIG_BUCKET", "bucket_name": "vll-petition-signatures" }]  // only if DRAWN_SIGNATURE
}
```

Secrets (`wrangler secret put …`): `TURNSTILE_SECRET_KEY`, `FORM_HMAC_KEY` (32+ random bytes), `EMAIL_API_KEY` (if email enabled).

Never commit secrets, the household CSV, or any export to git. Add `*.csv`, `.dev.vars` to `.gitignore`.

---

## 14. Scheduled job (cron, daily)

1. `UPDATE signatures SET ip_address=NULL, user_agent=NULL, cf_asn=NULL WHERE signed_at < now - retention_days_ip`.
2. `DELETE FROM submission_log WHERE created_at < now - retention_days_ip`.
3. For `status='withdrawn'` older than 30 days: set `full_name='[withdrawn]'`, `email=''`, `phone=NULL`, `typed_signature='[withdrawn]'`, clear IP fields, delete R2 image.
4. If `settings.final_decision_date` is set and older than 90 days, or `signed_at < now - retention_days_all`: delete signatures and logs. Households are kept.
5. Write one `admin_audit` row `purge` with counts. Never purge when `site_mode != closed` and the row is younger than 365 days (protects an active petition).

---

## 15. Project layout

```
vll-petition/
  wrangler.jsonc
  package.json
  tsconfig.json
  migrations/0001_init.sql
  migrations/0002_seed_settings.sql
  public/            # css, js (combobox, turnstile loader), favicon
  src/index.ts       # Hono app, route wiring, scheduled handler
  src/routes/public.ts
  src/routes/admin.ts
  src/lib/validate.ts
  src/lib/turnstile.ts
  src/lib/access.ts  # JWT verification
  src/lib/email.ts
  src/lib/address.ts # normalisation + search
  src/lib/csv.ts
  src/views/*.ts     # HTML templates (escaped by default)
  test/*.test.ts
  scripts/import-households.ts  # local CSV -> SQL for first seed
  README.md
```

---

## 16. Build and deploy steps (Wrangler)

```bash
npm create cloudflare@latest vll-petition -- --type=hello-world --lang=ts
cd vll-petition
npm i hono
npm i -D @cloudflare/vitest-pool-workers vitest

npx wrangler login
npx wrangler d1 create vll-petition-db          # paste database_id into wrangler.jsonc
npx wrangler d1 migrations apply vll-petition-db --local
npx wrangler d1 migrations apply vll-petition-db --remote

# Turnstile: create a widget in the Cloudflare dashboard for the site domain (managed mode)
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put FORM_HMAC_KEY
npx wrangler secret put EMAIL_API_KEY            # only if EMAIL_ENABLED=true

npm test
npx wrangler dev                                 # local, uses .dev.vars and local D1
npx wrangler deploy
```

After first deploy:
1. Attach the custom domain to the Worker (Workers & Pages → the Worker → Settings → Domains & Routes).
2. Create a Cloudflare Access self-hosted application for `<domain>/admin*` with an allow policy for the admin emails; copy its AUD tag into `ACCESS_AUD` and redeploy.
3. Seed households through `/admin/households` import (or `scripts/import-households.ts` + `wrangler d1 execute --remote --file`).
4. Publish the pledge text as the first `petition_versions` row.
5. Run the acceptance checklist (§17) against production with a test household, then reject the test signature.

---

## 17. Acceptance criteria

- [ ] A resident can find their address by typing the house number, fill the form and sign on a 320 px phone screen in under two minutes.
- [ ] The form works with JavaScript disabled except for the Turnstile step, and the fallback paper message is shown.
- [ ] A second signature from the same household is refused with the §4.4 message and logged; the first signer's name is not revealed.
- [ ] An address not in `households` cannot be submitted, including by crafting the POST.
- [ ] `ip_address` equals the `CF-Connecting-IP` header; `user_agent`, `cf_country`, `signed_at` are stored.
- [ ] Turnstile failure, honeypot, too-fast submission and rate limits each behave as specified and are logged.
- [ ] Changing the active petition version invalidates open forms with the version-mismatch message.
- [ ] `/admin` is unreachable without Cloudflare Access, and a request with a forged or missing `Cf-Access-Jwt-Assertion` is refused by the Worker.
- [ ] CSV export opens correctly in Excel, excludes IP columns by default, and escapes formula-like cells.
- [ ] Print view repeats petition title and language on every page with dated signatures.
- [ ] Progress shows correct counts, excludes vacant and out-of-area households, and never exposes names.
- [ ] Withdraw link works and the withdrawn household drops out of progress immediately.
- [ ] Retention cron clears IP fields and old logs per settings (test with a shortened setting).
- [ ] Privacy notice is linked from the form and the footer, and says the site is resident-run, not official.
- [ ] Lighthouse accessibility score ≥ 95 on `/` and `/sign`; axe reports no serious violations.

---

## 18. Sources

- Prince William County, *2025 PWC Residential Traffic Management Guide* (pwcva.gov, posted July 2026): petition threshold, one signature per household including renters, county-defined petition area, petition language on each page, 12-month validity, HOA resolution alternative, eligibility criteria (pp. 6, 8, 10, 11, 43).
- Prince William County DOT flyer, *Reduce Speeding in Your Neighborhood* (pwcgov.org): 75% support for physical measures, process order (study, plan, community support).
- Neither document addresses electronic signatures, an owner-only rule, a minimum age, or required fields beyond dated signatures and petition language. Confirm these with PWC DOT before switching to `petition` mode.
