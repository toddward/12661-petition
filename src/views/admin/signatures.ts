import { html, raw } from 'hono/html';
import type { SignatureFilters } from '../../lib/admin-data';
import { PAGE_SIZE } from '../../lib/admin-data';
import type { HouseholdRow } from '../../lib/address';
import type { PetitionVersion } from '../../lib/petition';
import {
  FLAG_LABELS,
  RELATIONSHIP_LABELS,
  parseFlags,
  type SignatureWithAddress,
} from '../../lib/signatures';
import { formatLocalShort } from '../../lib/time';
import { RELATIONSHIPS, formatPhone } from '../../lib/validate';
import type { Html } from '../layout';
import { arrowLeft, arrowRight, sortDown, sortUp } from '../icons';
import { adminLayout, qs, statusTag, yesNo } from './layout';

function filterQs(f: SignatureFilters, over: Partial<Record<keyof SignatureFilters, string | number>> = {}): string {
  const base: Record<string, string | number> = {
    status: f.status === 'active' ? '' : f.status,
    mode: f.mode,
    flagged: f.flagged ? '1' : '',
    unconfirmed: f.unconfirmed ? '1' : '',
    entry: f.entry,
    street: f.street,
    from: f.from,
    to: f.to,
    q: f.q,
    sort: f.sort === 'signed_at' ? '' : f.sort,
    dir: f.dir === 'desc' ? '' : f.dir,
    page: f.page > 1 ? f.page : '',
  };
  return qs({ ...base, ...over });
}

function sortHeader(f: SignatureFilters, key: string, label: string): Html {
  const active = f.sort === key;
  const nextDir = active && f.dir === 'desc' ? 'asc' : 'desc';
  const aria = active ? raw(` aria-sort="${f.dir === 'asc' ? 'ascending' : 'descending'}"`) : raw('');
  return html`<th scope="col"${aria}><a href="/admin/signatures${filterQs(f, { sort: key, dir: nextDir, page: '' })}">${label}${active ? (f.dir === 'asc' ? sortUp : sortDown) : ''}</a></th>`;
}

function flagTags(flags: string | null): Html {
  return html`${parseFlags(flags).map((fl) => html`<span class="tag tag-flag" title="${FLAG_LABELS[fl] ?? fl}">${fl}</span> `)}`;
}

function sel(v: string, cur: string): Html {
  return v === cur ? raw(' selected') : raw('');
}

export function signatureListPage(opts: {
  email: string;
  filters: SignatureFilters;
  rows: SignatureWithAddress[];
  total: number;
  streets: string[];
  flash?: string | null;
}): Html {
  const f = opts.filters;
  const pages = Math.max(1, Math.ceil(opts.total / PAGE_SIZE));
  const body = html`
  <form method="get" action="/admin/signatures" class="filters">
    <label>Status <select name="status">
      ${['active', 'withdrawn', 'rejected', 'all'].map((s) => html`<option value="${s}"${sel(s, f.status)}>${s}</option>`)}
    </select></label>
    <label>Mode <select name="mode"><option value="">any</option>
      ${['pledge', 'petition'].map((m) => html`<option value="${m}"${sel(m, f.mode)}>${m}</option>`)}
    </select></label>
    <label>Street <select name="street"><option value="">any</option>
      ${opts.streets.map((s) => html`<option value="${s}"${sel(s, f.street)}>${s}</option>`)}
    </select></label>
    <label>Entry <select name="entry"><option value="">any</option>
      ${['online', 'paper'].map((m) => html`<option value="${m}"${sel(m, f.entry)}>${m}</option>`)}
    </select></label>
    <label>From <input type="date" name="from" value="${f.from}"></label>
    <label>To <input type="date" name="to" value="${f.to}"></label>
    <label>Name or email <input type="search" name="q" value="${f.q}"></label>
    <label class="check-inline"><input type="checkbox" name="flagged" value="1"${f.flagged ? raw(' checked') : ''}> Flagged only</label>
    <label class="check-inline"><input type="checkbox" name="unconfirmed" value="1"${f.unconfirmed ? raw(' checked') : ''}> Unconfirmed email</label>
    <button type="submit" class="button">Filter</button>
    <a href="/admin/signatures">Reset</a>
  </form>

  <p>${opts.total} ${opts.total === 1 ? 'signature' : 'signatures'}. ${pages > 1 ? html`Page ${f.page} of ${pages}.` : ''}</p>
  <div class="table-scroll">
  <table class="table">
    <thead><tr>
      ${sortHeader(f, 'name', 'Name')}
      ${sortHeader(f, 'address', 'Address')}
      ${sortHeader(f, 'signed_at', 'Signed (ET)')}
      <th scope="col">Mode</th>
      <th scope="col">Relationship</th>
      <th scope="col">Email confirmed</th>
      <th scope="col">Flags</th>
      ${sortHeader(f, 'status', 'Status')}
    </tr></thead>
    <tbody>
      ${opts.rows.length
        ? opts.rows.map(
            (r) => html`<tr>
              <td><a href="/admin/signatures/${r.id}">${r.full_name}</a>${r.entry_method === 'paper' ? html` <span class="tag">paper</span>` : ''}</td>
              <td>${r.household_label}</td>
              <td>${formatLocalShort(r.signed_at)}</td>
              <td>${r.mode}</td>
              <td>${RELATIONSHIP_LABELS[r.relationship] ?? r.relationship}</td>
              <td>${r.entry_method === 'paper' ? html`<span class="muted">n/a</span>` : yesNo(r.email_confirmed_at ? 1 : 0)}</td>
              <td>${flagTags(r.flags)}</td>
              <td>${statusTag(r.status)}</td>
            </tr>`,
          )
        : html`<tr><td colspan="8">No signatures match these filters.</td></tr>`}
    </tbody>
  </table>
  </div>
  ${pages > 1
    ? html`<nav class="pager" aria-label="Pages">
        ${f.page > 1 ? html`<a href="/admin/signatures${filterQs(f, { page: f.page - 1 })}" class="back-link">${arrowLeft}Previous</a>` : ''}
        ${f.page < pages ? html`<a href="/admin/signatures${filterQs(f, { page: f.page + 1 })}" class="back-link">Next${arrowRight}</a>` : ''}
      </nav>`
    : ''}`;
  return adminLayout({ title: 'Signatures', email: opts.email, active: 'signatures', body, flash: opts.flash });
}

export interface LogRow {
  event: string;
  created_at: string;
  ip_address: string | null;
  cf_country: string | null;
  detail: string | null;
}

export function signatureDetailPage(opts: {
  email: string;
  sig: SignatureWithAddress;
  household: HouseholdRow | null;
  version: PetitionVersion | null;
  logs: LogRow[];
  others: SignatureWithAddress[];
  flash?: string | null;
  error?: string | null;
}): Html {
  const { sig } = opts;
  const flags = parseFlags(sig.flags);
  const row = (k: string, v: Html | string | number | null) => html`<div><dt>${k}</dt><dd>${v ?? html`<span class="muted">—</span>`}</dd></div>`;
  const body = html`
  <p><a class="back-link" href="/admin/signatures">${arrowLeft}All signatures</a></p>
  <div class="cards">
    <section class="card wide">
      <h2>Signature</h2>
      <dl class="detail">
        ${row('Status', html`${statusTag(sig.status)}${sig.status_reason ? html` <span class="small">${sig.status_reason}</span>` : ''}${sig.status_changed_at ? html` <span class="small muted">(${formatLocalShort(sig.status_changed_at)})</span>` : ''}`)}
        ${row('Name', sig.full_name)}
        ${row('Address', html`${sig.household_label}${opts.household && !opts.household.occupied ? html` <span class="tag">vacant</span>` : ''}${opts.household && !opts.household.in_petition_area ? html` <span class="tag">outside area</span>` : ''}`)}
        ${row('Mode', sig.mode)}
        ${row('Signed', formatLocalShort(sig.signed_at))}
        ${row('Entry', sig.entry_method)}
        ${row('Relationship', RELATIONSHIP_LABELS[sig.relationship] ?? sig.relationship)}
        ${row('Typed signature', sig.typed_signature)}
        ${row('Email', sig.email || null)}
        ${row('Email confirmed', sig.email_confirmed_at ? formatLocalShort(sig.email_confirmed_at) : sig.entry_method === 'paper' ? 'n/a (paper)' : 'not yet')}
        ${row('Phone', sig.phone ? formatPhone(sig.phone) : null)}
        ${row('Updates opt-in', sig.updates_opt_in ? 'yes' : 'no')}
        ${row('Follow-up sent', sig.followup_sent_at ? formatLocalShort(sig.followup_sent_at) : null)}
        ${row('Petition text', opts.version ? html`<a href="/admin/petition/${opts.version.id}">${opts.version.title}</a> <code>${opts.version.sha256.slice(0, 12)}</code>` : sig.petition_version_id)}
      </dl>
    </section>
    <section class="card wide">
      <h2>Submission details</h2>
      <dl class="detail">
        ${row('IP address', sig.ip_address)}
        ${row('User agent', sig.user_agent ? html`<span class="small">${sig.user_agent}</span>` : null)}
        ${row('Country', sig.cf_country)}
        ${row('Network (ASN)', sig.cf_asn)}
        ${row('Flags', flags.length ? html`${flags.map((fl) => html`<span class="tag tag-flag">${FLAG_LABELS[fl] ?? fl}</span> `)}` : null)}
      </dl>
      <p class="small muted">IP and browser details are cleared automatically after the retention period.</p>
    </section>
  </div>

  <section class="panel">
    <h2>Actions</h2>
    <div class="actions">
      ${sig.status === 'active'
        ? html`<form method="post" action="/admin/signatures/${sig.id}/reject" class="stack">
            <label for="reason">Reject: reason (required)</label>
            <textarea id="reason" name="reason" rows="2" required maxlength="500"></textarea>
            <button type="submit" class="button button-danger">Reject signature</button>
          </form>`
        : html`<form method="post" action="/admin/signatures/${sig.id}/restore">
            <p>Restoring makes this the active signature for the household again (only if no other active one exists).</p>
            <button type="submit" class="button">Restore signature</button>
          </form>`}
      ${opts.household && opts.household.occupied
        ? html`<form method="post" action="/admin/households/${opts.household.id}/vacant">
            <input type="hidden" name="return_to" value="/admin/signatures/${sig.id}">
            <p>Mark the household vacant. It is then excluded from the denominator and progress.</p>
            <button type="submit" class="button">Mark household vacant</button>
          </form>`
        : ''}
    </div>
  </section>

  ${opts.others.length
    ? html`<section class="panel"><h2>Other signatures for this household</h2>
        <ul>${opts.others.map((o) => html`<li><a href="/admin/signatures/${o.id}">${o.full_name}</a>, ${o.mode}, ${formatLocalShort(o.signed_at)}, ${statusTag(o.status)}</li>`)}</ul></section>`
    : ''}

  <section class="panel">
    <h2>Submission log</h2>
    ${opts.logs.length
      ? html`<table class="table compact"><thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">IP</th><th scope="col">Country</th><th scope="col">Detail</th></tr></thead>
        <tbody>${opts.logs.map((l) => html`<tr><td>${formatLocalShort(l.created_at)}</td><td><code>${l.event}</code></td><td>${l.ip_address ?? ''}</td><td>${l.cf_country ?? ''}</td><td class="small">${l.detail ?? ''}</td></tr>`)}</tbody></table>`
      : html`<p>No log entries.</p>`}
  </section>`;
  return adminLayout({ title: sig.full_name, email: opts.email, active: 'signatures', body, flash: opts.flash, error: opts.error });
}

export interface PaperValues {
  household_id: string;
  full_name: string;
  relationship: string;
  signed_date: string;
  email: string;
  phone: string;
  note: string;
}

export function paperEntryPage(opts: {
  email: string;
  mode: string;
  households: { id: string; label: string; street_name: string }[];
  values: PaperValues;
  errors: Partial<Record<keyof PaperValues, string>>;
  flash?: string | null;
  error?: string | null;
  canEnter: boolean;
}): Html {
  const v = opts.values;
  const e = opts.errors;
  const err = (k: keyof PaperValues) => (e[k] ? html`<p class="field-error" id="${k}-error">${e[k]}</p>` : '');
  const groups: { street: string; items: typeof opts.households }[] = [];
  for (const h of opts.households) {
    const g = groups[groups.length - 1];
    if (g && g.street === h.street_name) g.items.push(h);
    else groups.push({ street: h.street_name, items: [h] });
  }
  const body = opts.canEnter
    ? html`
  <p>Type in a signature collected on a paper form. It is recorded as a <strong>${opts.mode}</strong> under the active petition text,
  with no IP address. Keep the paper original: the county may ask for it.</p>
  <form method="post" action="/admin/paper" class="admin-form">
    <div class="field"><label for="household_id">Household</label>${err('household_id')}
      <select id="household_id" name="household_id" required>
        <option value="">Choose an address</option>
        ${groups.map((g) => html`<optgroup label="${g.street}">${g.items.map((h) => html`<option value="${h.id}"${h.id === v.household_id ? raw(' selected') : ''}>${h.label}</option>`)}</optgroup>`)}
      </select></div>
    <div class="field"><label for="full_name">Printed name</label>${err('full_name')}
      <input id="full_name" name="full_name" value="${v.full_name}" required maxlength="100"></div>
    <fieldset class="field"><legend>Relationship</legend>${err('relationship')}
      ${RELATIONSHIPS.map((r) => html`<div class="radio"><input type="radio" id="rel_${r.value}" name="relationship" value="${r.value}"${v.relationship === r.value ? raw(' checked') : ''}><label for="rel_${r.value}">${r.label}</label></div>`)}
    </fieldset>
    <div class="field"><label for="signed_date">Date signed on paper</label>${err('signed_date')}
      <input type="date" id="signed_date" name="signed_date" value="${v.signed_date}" required></div>
    <div class="field"><label for="email">Email <span class="optional">(optional)</span></label>${err('email')}
      <input type="email" id="email" name="email" value="${v.email}" maxlength="254"></div>
    <div class="field"><label for="phone">Phone <span class="optional">(optional)</span></label>${err('phone')}
      <input type="tel" id="phone" name="phone" value="${v.phone}" maxlength="20"></div>
    <div class="field"><label for="note">Note <span class="optional">(optional, e.g. who collected it)</span></label>
      <input id="note" name="note" value="${v.note}" maxlength="200"></div>
    <button type="submit" class="button button-primary">Add paper signature</button>
  </form>`
    : html`<p>Paper entry is not available: the site is closed or no petition text matching the site mode is active.</p>`;
  return adminLayout({ title: 'Paper entry', email: opts.email, active: 'paper', body, flash: opts.flash, error: opts.error });
}
