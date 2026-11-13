import { html } from 'hono/html';
import type { DashboardStats } from '../../lib/admin-data';
import type { PetitionVersion } from '../../lib/petition';
import { householdsToGoal, type Progress } from '../../lib/progress';
import type { Settings } from '../../lib/settings';
import { RELATIONSHIP_LABELS } from '../../lib/signatures';
import { daysBetween, formatLocalDate, formatLocalShort } from '../../lib/time';
import { progressBar } from '../components';
import type { Html } from '../layout';
import { adminLayout } from './layout';

export interface RecentEvent {
  event: string;
  created_at: string;
  cf_country: string | null;
  detail: string | null;
}

export function dashboardPage(opts: {
  email: string;
  settings: Settings;
  progress: Progress;
  stats: DashboardStats;
  version: PetitionVersion | null;
  recent: RecentEvent[];
  emailOn: boolean;
  flash?: string | null;
}): Html {
  const { settings: s, progress: p, stats, version } = opts;
  const mode = p.counted_mode;
  const age = stats.oldestActive ? daysBetween(stats.oldestActive) : null;
  const remaining = age === null ? null : 365 - age;
  const statuses = ['active', 'withdrawn', 'rejected'];
  const countFor = (m: string, st: string) => stats.byModeStatus.find((r) => r.mode === m && r.status === st)?.n ?? 0;

  const warnings: Html[] = [];
  if (!version) warnings.push(html`<li>No petition text is published. <a href="/admin/petition">Publish a version</a>.</li>`);
  else if (s.site_mode !== 'closed' && version.mode !== s.site_mode)
    warnings.push(html`<li>The site is in <strong>${s.site_mode}</strong> mode but the active text is a <strong>${version.mode}</strong>. Signing is paused until they match.</li>`);
  if (stats.households.total === 0) warnings.push(html`<li>No households yet. <a href="/admin/households/import">Import the address list</a>.</li>`);
  else if (stats.households.in_area === 0)
    warnings.push(html`<li>The petition area is not set. ${s.site_mode === 'pledge' ? 'Any active household can pledge until it is.' : 'Nobody can sign the petition until it is.'} <a href="/admin/households">Set the area</a>.</li>`);
  if (!s.organizer_email) warnings.push(html`<li>No public organizer email. <a href="/admin/settings">Add contact details</a>.</li>`);
  if (!opts.emailOn) warnings.push(html`<li>Confirmation emails are off (<code>EMAIL_ENABLED</code>). Signers are told to contact you to withdraw.</li>`);
  if (remaining !== null && remaining <= 60 && mode === 'petition')
    warnings.push(html`<li><strong>The oldest petition signature expires in ${remaining} days.</strong> County petitions are valid for 12 months.</li>`);

  const body = html`
  ${warnings.length ? html`<section class="panel panel-warn"><h2>Needs attention</h2><ul>${warnings}</ul></section>` : ''}

  <div class="cards">
    <section class="card">
      <h2>Progress (${mode})</h2>
      ${p.occupied_total > 0
        ? html`<p class="big-number">${p.percent}%</p>
            <p>${p.signed} of ${p.occupied_total} occupied households in the area. Goal ${p.goal_percent}%.</p>
            <div class="progress-bar">${progressBar(p)}</div>
            <p class="small">${householdsToGoal(p)} more needed.${s.occupied_override ? html` Denominator overridden to ${s.occupied_override}.` : ''}</p>`
        : html`<p>Progress appears once the petition area is set.</p>`}
    </section>
    <section class="card">
      <h2>Site</h2>
      <p>Mode: <strong class="mode-badge mode-${s.site_mode}">${s.site_mode}</strong> · <a href="/admin/mode">change</a></p>
      <p>Active text: ${version ? html`<a href="/admin/petition/${version.id}">${version.title}</a> <code>${version.sha256.slice(0, 8)}</code>` : 'none'}</p>
      <p>Email confirmation required to count: ${s.require_email_confirmation ? 'yes' : 'no'}</p>
    </section>
    <section class="card">
      <h2>12-month validity</h2>
      ${stats.oldestActive
        ? html`<p>Oldest active ${mode}: <strong>${formatLocalDate(stats.oldestActive)}</strong> (${age} days ago).</p>
            <p>${remaining! > 0 ? html`<strong>${remaining}</strong> days until it is 12 months old.` : html`<strong>Older than 12 months.</strong>`}</p>`
        : html`<p>No active ${mode} signatures yet.</p>`}
    </section>
    <section class="card">
      <h2>Review</h2>
      <ul class="plain">
        <li><a href="/admin/signatures?flagged=1">${stats.flagged} flagged</a> active signatures</li>
        <li><a href="/admin/signatures?mode=${mode}&unconfirmed=1">${stats.unconfirmed} unconfirmed emails</a> (${mode})</li>
        <li><a href="/admin/signatures?mode=${mode}&entry=paper">${stats.paper} paper entries</a> (${mode})</li>
        <li><a href="/admin/followups">${stats.pledgedNotSigned} households pledged, not yet signed</a></li>
      </ul>
    </section>
  </div>

  <div class="cards">
    <section class="card">
      <h2>Signatures by mode and status</h2>
      <table class="table compact">
        <thead><tr><th scope="col">Mode</th>${statuses.map((st) => html`<th scope="col" class="num">${st}</th>`)}</tr></thead>
        <tbody>${(['pledge', 'petition'] as const).map(
          (m) => html`<tr><th scope="row">${m}</th>${statuses.map(
            (st) => html`<td class="num"><a href="/admin/signatures?mode=${m}&status=${st}">${countFor(m, st)}</a></td>`,
          )}</tr>`,
        )}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Active ${mode} by relationship</h2>
      <table class="table compact"><tbody>
        ${(['owner', 'renter', 'resident'] as const).map(
          (r) => html`<tr><th scope="row">${RELATIONSHIP_LABELS[r]}</th><td class="num">${stats.byRelationship.find((x) => x.relationship === r)?.n ?? 0}</td></tr>`,
        )}
      </tbody></table>
    </section>
    <section class="card">
      <h2>Households</h2>
      <table class="table compact"><tbody>
        <tr><th scope="row">Active households</th><td class="num">${stats.households.total}</td></tr>
        <tr><th scope="row">In petition area</th><td class="num">${stats.households.in_area}</td></tr>
        <tr><th scope="row">Occupied in area</th><td class="num">${stats.households.occupied_in_area}</td></tr>
        <tr><th scope="row">Vacant in area</th><td class="num">${stats.households.vacant_in_area}</td></tr>
      </tbody></table>
    </section>
  </div>

  <section class="panel">
    <h2>Recent activity</h2>
    ${opts.recent.length
      ? html`<table class="table compact"><thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">Country</th><th scope="col">Detail</th></tr></thead>
          <tbody>${opts.recent.map(
            (e) => html`<tr><td>${formatLocalShort(e.created_at)}</td><td><code>${e.event}</code></td><td>${e.cf_country ?? ''}</td><td class="small">${e.detail ?? ''}</td></tr>`,
          )}</tbody></table>
          <p><a href="/admin/audit">Full audit log</a></p>`
      : html`<p>No activity yet.</p>`}
  </section>`;

  return adminLayout({ title: 'Dashboard', email: opts.email, active: 'dashboard', body, flash: opts.flash });
}
