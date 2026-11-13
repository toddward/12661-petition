-- Victory Lakes Loop petition site: initial schema (spec §5).
-- Additions beyond the spec are marked "ADDED" with the reason.

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
CREATE INDEX idx_households_street ON households(street_name);

CREATE TABLE petition_versions (
  id                TEXT PRIMARY KEY,
  mode              TEXT NOT NULL CHECK (mode IN ('pledge','petition')),
  title             TEXT NOT NULL,
  body_markdown     TEXT NOT NULL,        -- verbatim county language in petition mode
  attestation_text  TEXT NOT NULL,
  sha256            TEXT NOT NULL,        -- hash of title + body + attestation
  source_note       TEXT,                 -- e.g. "Text provided by PWC DOT, email of <date>"
  active            INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  published_at      TEXT                  -- ADDED: set when first published; published rows are immutable
);
-- Exactly one active version at a time (enforced in app + partial unique index)
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
  flags                TEXT,               -- JSON array of review flags, e.g. ["shared_ip","email_reused"]
  -- ADDED: 'paper' rows were typed in by an admin from a wet-ink form. Kept in its own
  -- column so a later reject/restore (which rewrites status_reason) cannot erase it.
  entry_method         TEXT NOT NULL DEFAULT 'online' CHECK (entry_method IN ('online','paper')),
  -- ADDED: when the pledge-to-petition follow-up email went out (one per household, §7).
  followup_sent_at     TEXT
);
-- One active signature per household per mode
CREATE UNIQUE INDEX one_active_per_household
  ON signatures(household_id, mode) WHERE status = 'active';
CREATE INDEX idx_signatures_email ON signatures(email);
CREATE INDEX idx_signatures_ip ON signatures(ip_address);
CREATE INDEX idx_signatures_token ON signatures(token_hash);   -- ADDED: /confirm and /withdraw lookups
CREATE INDEX idx_signatures_signed_at ON signatures(signed_at);

CREATE TABLE submission_log (
  id            TEXT PRIMARY KEY,
  event         TEXT NOT NULL,   -- sign_ok, duplicate_household, invalid_address, turnstile_fail,
                                 -- rate_limited, too_fast, version_mismatch, withdraw, confirm_email,
                                 -- honeypot, form_expired, validation_error, closed, unsubscribe
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
                                 -- set_mode, publish_version, purge, paper_entry, mark_vacant,
                                 -- create_version, update_settings, bulk_area, send_followups
  target       TEXT,
  detail       TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON admin_audit(created_at);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
