import { html, raw } from 'hono/html';
import type { SiteMode } from '../../env';
import type { PledgedRow } from '../../lib/admin-data';
import type { PetitionVersion } from '../../lib/petition';
import type { Settings } from '../../lib/settings';
import { formatLocalShort } from '../../lib/time';
import type { Html } from '../layout';
import { adminLayout, yesNo } from './layout';

const MODE_INFO: Record<SiteMode, { label: string; text: string }> = {
  pledge: {
    label: 'Pledge',
    text: 'Collect support before the county issues its petition. Labelled clearly as a pledge; does not count toward the county’s 75%.',
  },
  petition: {
    label: 'Petition',
    text: 'Collect signatures under the county-issued wording. Only counts if PWC DOT accepts electronic signatures.',
  },
  closed: { label: 'Closed', text: 'Stop accepting signatures. The home page shows the final count.' },
};

export function modePage(opts: { email: string; settings: Settings; version: PetitionVersion | null; flash?: string | null; error?: string | null }): Html {
  const cur = opts.settings.site_mode;
  const body = html`
  <p>Current mode: <strong class="mode-badge mode-${cur}">${cur}</strong>.
  Active text: ${opts.version ? html`<a href="/admin/petition/${opts.version.id}">${opts.version.title}</a> (${opts.version.mode})` : 'none'}.</p>
  <div class="cards">
    ${(['pledge', 'petition', 'closed'] as const).map(
      (m) => html`<section class="card${m === cur ? ' card-current' : ''}">
        <h2>${MODE_INFO[m].label}</h2>
        <p>${MODE_INFO[m].text}</p>
        ${m === cur ? html`<p><strong>Current mode</strong></p>` : html`<p><a class="button" href="/admin/mode/confirm?to=${m}">Switch to ${m}…</a></p>`}
      </section>`,
    )}
  </div>
  <p class="small">To switch between pledge and petition, publishing a version of the other kind switches the mode for you.</p>`;
  return adminLayout({ title: 'Site mode', email: opts.email, active: 'mode', body, flash: opts.flash, error: opts.error });
}

export function modeConfirmPage(opts: { email: string; from: SiteMode; to: SiteMode; problem: string | null }): Html {
  const body = opts.problem
    ? html`<section class="panel panel-warn"><p>${opts.problem}</p><p><a href="/admin/mode">Back</a></p></section>`
    : html`<section class="panel panel-warn">
        <h2>Switch from ${opts.from} to ${opts.to}?</h2>
        <ul>
          ${opts.to === 'closed' ? html`<li>The signing form stops accepting signatures immediately. Progress is shown as final.</li>` : ''}
          ${opts.from === 'pledge' && opts.to === 'petition'
            ? html`<li>Pledges are <strong>not</strong> converted into petition signatures. Households must sign again.</li>`
            : ''}
          ${opts.to === 'pledge' && opts.from === 'petition' ? html`<li>Petition signatures are kept but progress will count pledges.</li>` : ''}
          <li>This is recorded in the audit log.</li>
        </ul>
        <form method="post" action="/admin/mode">
          <input type="hidden" name="to" value="${opts.to}">
          <button type="submit" class="button button-primary">Yes, switch to ${opts.to}</button>
          <a href="/admin/mode">Cancel</a>
        </form>
      </section>`;
  return adminLayout({ title: 'Confirm mode change', email: opts.email, active: 'mode', body });
}

export function followupsPage(opts: {
  email: string;
  rows: PledgedRow[];
  siteMode: SiteMode;
  emailOn: boolean;
  batchSize: number;
  flash?: string | null;
  error?: string | null;
  sentNote?: string | null;
}): Html {
  const pending = opts.rows.filter((r) => r.updates_opt_in && !r.followup_sent_at && r.email);
  const canSend = opts.siteMode === 'petition' && opts.emailOn && pending.length > 0;
  const body = html`
  <p>Households that pledged but have not signed the petition. Pledges never turn into signatures automatically.</p>
  <section class="panel">
    <h2>Email opted-in pledgers</h2>
    <p>${pending.length} ${pending.length === 1 ? 'household has' : 'households have'} opted in and not been emailed yet.
      Each household gets one email, with an unsubscribe link.</p>
    ${opts.siteMode !== 'petition' ? html`<p class="muted">Available once the site is in petition mode.</p>` : ''}
    ${!opts.emailOn ? html`<p class="muted">Email is off. Set <code>EMAIL_ENABLED</code>, <code>EMAIL_FROM</code> and the <code>EMAIL_API_KEY</code> secret.</p>` : ''}
    ${opts.sentNote ? html`<p role="status">${opts.sentNote}</p>` : ''}
    <form method="post" action="/admin/followups/send">
      <button type="submit" class="button button-primary"${canSend ? '' : raw(' disabled')}>Send next batch (up to ${opts.batchSize})</button>
    </form>
  </section>
  <div class="table-scroll"><table class="table">
    <thead><tr><th scope="col">Address</th><th scope="col">Name</th><th scope="col">Pledged</th><th scope="col">Opted in</th><th scope="col">Follow-up sent</th></tr></thead>
    <tbody>${opts.rows.length
      ? opts.rows.map(
          (r) => html`<tr><td>${r.household_label}</td><td><a href="/admin/signatures/${r.signature_id}">${r.full_name}</a></td>
            <td>${formatLocalShort(r.signed_at)}</td><td>${yesNo(r.updates_opt_in)}</td>
            <td>${r.followup_sent_at ? formatLocalShort(r.followup_sent_at) : html`<span class="muted">—</span>`}</td></tr>`,
        )
      : html`<tr><td colspan="5">Every pledging household has also signed the petition (or there are no pledges).</td></tr>`}</tbody>
  </table></div>`;
  return adminLayout({ title: 'Pledged, not yet signed', email: opts.email, active: 'followups', body, flash: opts.flash, error: opts.error });
}

export function exportPage(opts: { email: string; siteMode: SiteMode }): Html {
  const defMode = opts.siteMode === 'pledge' ? 'pledge' : 'petition';
  const modeSelect = html`<select name="mode">${(['pledge', 'petition'] as const).map(
    (m) => html`<option value="${m}"${m === defMode ? raw(' selected') : ''}>${m}</option>`,
  )}</select>`;
  const body = html`
  <section class="panel">
    <h2>CSV export</h2>
    <p>Opens in Excel. IP address columns are left out unless you tick the box (for county verification only).
    Never commit exports to git or email them unencrypted.</p>
    <form method="get" action="/admin/export.csv" class="filters">
      <label>Mode ${modeSelect}</label>
      <label>Status <select name="status"><option value="active" selected>active</option><option value="withdrawn">withdrawn</option><option value="rejected">rejected</option><option value="all">all</option></select></label>
      <label class="check-inline"><input type="checkbox" name="include_ip" value="1"> Include IP, browser and country</label>
      <button type="submit" class="button button-primary">Download CSV</button>
    </form>
  </section>
  <section class="panel">
    <h2>Print view</h2>
    <p>Printer-friendly pages with the petition title and full text at the top of every page, then household address,
    printed name, signature, relationship and date signed. Use your browser’s Print (choose “Save as PDF” for a file).</p>
    <form method="get" action="/admin/print" class="filters">
      <label>Mode ${modeSelect}</label>
      <label>Rows per page <input type="number" name="per_page" value="12" min="3" max="40"></label>
      <label class="check-inline"><input type="checkbox" name="blank" value="1"> Blank rows for wet-ink signing (addresses in the area that have not signed)</label>
      <button type="submit" class="button">Open print view</button>
    </form>
  </section>`;
  return adminLayout({ title: 'Export & print', email: opts.email, active: 'export', body });
}

export function settingsPage(opts: { email: string; settings: Settings; flash?: string | null; error?: string | null }): Html {
  const s = opts.settings;
  const field = (name: string, label: string, value: string | number, hint?: string, type = 'text', extra = '') =>
    html`<div class="field"><label for="${name}">${label}</label>${hint ? html`<p class="hint">${hint}</p>` : ''}
      <input id="${name}" name="${name}" type="${type}" value="${value}"${raw(extra)}></div>`;
  const body = html`
  <form method="post" action="/admin/settings" class="admin-form">
    <h2>Public contact (spec §12.3)</h2>
    ${field('organizer_name', 'Organizer name', s.organizer_name, 'Shown on every page and in emails.', 'text', ' maxlength="100" required')}
    ${field('organizer_email', 'Organizer email', s.organizer_email, 'Shown publicly. Leave blank to hide.', 'email', ' maxlength="254"')}
    ${field('organizer_phone', 'Organizer phone', s.organizer_phone, 'Optional. Shown publicly.', 'tel', ' maxlength="30"')}
    ${field('co_organizers', 'Co-organizers who can see signer data', s.co_organizers, 'Named in the privacy notice, e.g. “Renee W.”', 'text', ' maxlength="200"')}

    <h2>Counting</h2>
    ${field('goal_percent', 'Goal percent', s.goal_percent, 'County rule for physical measures: 75.', 'number', ' min="1" max="100" required')}
    ${field('occupied_override', 'Occupied households override', s.occupied_override ?? '', 'Leave blank to count occupied in-area households from the address list.', 'number', ' min="1"')}
    <div class="field check"><input type="checkbox" id="require_email_confirmation" name="require_email_confirmation" value="true"${s.require_email_confirmation ? raw(' checked') : ''}>
      <label for="require_email_confirmation">Only count signatures whose email is confirmed (paper entries always count)</label></div>

    <h2>Retention (spec §9.2, §14)</h2>
    ${field('retention_days_ip', 'Delete IP and browser details after (days)', s.retention_days_ip, 'Default 365, the county petition’s 12-month validity.', 'number', ' min="1" required')}
    ${field('retention_days_all', 'Delete all signature data after (days)', s.retention_days_all, 'Default 730.', 'number', ' min="1" required')}
    ${field('final_decision_date', 'County final decision date', s.final_decision_date, 'Once set, all signature data is deleted 90 days after this date (only when the site is closed, or for rows older than 365 days).', 'date')}
    ${field('privacy_updated', 'Privacy notice “last updated” date', s.privacy_updated, undefined, 'date', ' required')}

    <button type="submit" class="button button-primary">Save settings</button>
  </form>

  <section class="panel">
    <h2>Run the retention job now</h2>
    <p class="small">Runs the same clean-up as the daily scheduled job, using the settings above. It cannot be undone.</p>
    <form method="post" action="/admin/retention/run"><button type="submit" class="button button-danger">Run retention now</button></form>
  </section>`;
  return adminLayout({ title: 'Settings', email: opts.email, active: 'settings', body, flash: opts.flash, error: opts.error });
}

export interface AuditRow {
  admin_email: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
}
export interface LogRow {
  event: string;
  signature_id: string | null;
  ip_address: string | null;
  cf_country: string | null;
  detail: string | null;
  created_at: string;
}

export function auditPage(opts: { email: string; audit: AuditRow[]; logs: LogRow[]; event: string; events: string[] }): Html {
  const body = html`
  <section class="panel">
    <h2>Admin actions</h2>
    <div class="table-scroll"><table class="table compact">
      <thead><tr><th scope="col">When</th><th scope="col">Admin</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Detail</th></tr></thead>
      <tbody>${opts.audit.length
        ? opts.audit.map(
            (a) => html`<tr><td>${formatLocalShort(a.created_at)}</td><td>${a.admin_email}</td><td><code>${a.action}</code></td><td class="small">${a.target ?? ''}</td><td class="small">${a.detail ?? ''}</td></tr>`,
          )
        : html`<tr><td colspan="5">No admin actions yet.</td></tr>`}</tbody>
    </table></div>
  </section>
  <section class="panel">
    <h2>Submission log</h2>
    <form method="get" action="/admin/audit" class="filters">
      <label>Event <select name="event"><option value="">all</option>${opts.events.map((e) => html`<option value="${e}"${e === opts.event ? raw(' selected') : ''}>${e}</option>`)}</select></label>
      <button type="submit" class="button">Filter</button>
    </form>
    <div class="table-scroll"><table class="table compact">
      <thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">Signature</th><th scope="col">IP</th><th scope="col">Country</th><th scope="col">Detail</th></tr></thead>
      <tbody>${opts.logs.length
        ? opts.logs.map(
            (l) => html`<tr><td>${formatLocalShort(l.created_at)}</td><td><code>${l.event}</code></td>
              <td>${l.signature_id ? html`<a href="/admin/signatures/${l.signature_id}">view</a>` : ''}</td>
              <td>${l.ip_address ?? ''}</td><td>${l.cf_country ?? ''}</td><td class="small">${l.detail ?? ''}</td></tr>`,
          )
        : html`<tr><td colspan="6">No entries.</td></tr>`}</tbody>
    </table></div>
    <p class="small muted">Showing the latest 200 entries of each.</p>
  </section>`;
  return adminLayout({ title: 'Audit log', email: opts.email, active: 'audit', body });
}
