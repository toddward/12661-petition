-- Default settings (spec §5 seed) and the launch pledge text (spec §3, §16 step 4).
-- Decisions still open (spec §12) are left blank here and edited in /admin/settings.
INSERT INTO settings (key, value) VALUES
  ('site_mode', 'pledge'),
  ('goal_percent', '75'),
  ('occupied_override', ''),
  ('organizer_name', 'Todd Wardzinski'),
  ('organizer_email', ''),
  ('organizer_phone', ''),
  ('co_organizers', ''),
  ('retention_days_ip', '365'),
  ('retention_days_all', '730'),
  ('require_email_confirmation', 'false'),
  ('final_decision_date', ''),
  ('privacy_updated', '2026-11-13');

-- The sha256 below is SHA-256 of title + "\n\n" + body + "\n\n" + attestation (see src/lib/petition.ts).
INSERT INTO petition_versions (id, mode, title, body_markdown, attestation_text, sha256, source_note, active, created_at, published_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'pledge',
  'Pledge of support: speed tables on Victory Lakes Loop',
  'I support speed tables on Victory Lakes Loop and will sign the county''s petition when it is available.

This is a pledge of support only. It is not Prince William County''s petition, and it does not count toward the county''s 75% requirement. When the county issues its petition, we will ask you to sign that too.',
  'I live at this address and am signing on behalf of my household.',
  'a796610f274509cc90db40555381e4da039f025eb1fc33e5ff7b511c902048f6',
  'Launch pledge text written by the organizer. Not county wording.',
  1,
  '2026-11-13T00:00:00.000Z',
  '2026-11-13T00:00:00.000Z'
);
