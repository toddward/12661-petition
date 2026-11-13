import { html, raw } from 'hono/html';
import type { HouseholdRow } from '../../lib/address';
import type { ImportDiff } from '../../lib/households';
import type { Html } from '../layout';
import { adminLayout, qs, yesNo } from './layout';

export interface HouseholdListRow extends HouseholdRow {
  pledge_status: string | null;
  petition_status: string | null;
}

export interface HouseholdFilters {
  street: string;
  area: string; // '1' | '0' | ''
  occupied: string;
  active: string;
  q: string;
}

function sel(v: string, cur: string): Html {
  return v === cur ? raw(' selected') : raw('');
}

function sigTag(status: string | null): Html {
  return status ? html`<span class="tag tag-${status}">${status}</span>` : html`<span class="muted">—</span>`;
}

export function householdListPage(opts: {
  email: string;
  rows: HouseholdListRow[];
  filters: HouseholdFilters;
  streets: { street_name: string; total: number; in_area: number; occupied_in_area: number }[];
  flash?: string | null;
  error?: string | null;
}): Html {
  const f = opts.filters;
  const body = html`
  <p><a class="button" href="/admin/households/import">Import CSV</a></p>

  <section class="panel">
    <h2>Petition area by street</h2>
    <p class="small">The county defines the petition area: the street under study and every street with access to it.
    Set whole streets here, then fix single homes with Edit.</p>
    <table class="table compact">
      <thead><tr><th scope="col">Street</th><th scope="col" class="num">Homes</th><th scope="col" class="num">In area</th><th scope="col" class="num">Occupied in area</th><th scope="col">Set whole street</th></tr></thead>
      <tbody>${opts.streets.map(
        (s) => html`<tr>
          <th scope="row"><a href="/admin/households${qs({ street: s.street_name })}">${s.street_name}</a></th>
          <td class="num">${s.total}</td><td class="num">${s.in_area}</td><td class="num">${s.occupied_in_area}</td>
          <td><form method="post" action="/admin/households/bulk-area" class="inline-form">
            <input type="hidden" name="street_name" value="${s.street_name}">
            <button type="submit" name="in_petition_area" value="1" class="button button-small">In area</button>
            <button type="submit" name="in_petition_area" value="0" class="button button-small">Out of area</button>
          </form></td>
        </tr>`,
      )}</tbody>
    </table>
  </section>

  <form method="get" action="/admin/households" class="filters">
    <label>Street <select name="street"><option value="">any</option>
      ${opts.streets.map((s) => html`<option value="${s.street_name}"${sel(s.street_name, f.street)}>${s.street_name}</option>`)}
    </select></label>
    <label>In area <select name="area"><option value="">any</option><option value="1"${sel('1', f.area)}>yes</option><option value="0"${sel('0', f.area)}>no</option></select></label>
    <label>Occupied <select name="occupied"><option value="">any</option><option value="1"${sel('1', f.occupied)}>yes</option><option value="0"${sel('0', f.occupied)}>vacant</option></select></label>
    <label>Active <select name="active"><option value="1"${sel('1', f.active)}>yes</option><option value="0"${sel('0', f.active)}>no</option><option value="all"${sel('all', f.active)}>all</option></select></label>
    <label>Search <input type="search" name="q" value="${f.q}"></label>
    <button type="submit" class="button">Filter</button>
    <a href="/admin/households">Reset</a>
  </form>

  <p>${opts.rows.length} households shown.</p>
  <div class="table-scroll">
  <table class="table">
    <thead><tr><th scope="col">Address</th><th scope="col">ZIP</th><th scope="col">In area</th><th scope="col">Occupied</th><th scope="col">Active</th><th scope="col">Pledge</th><th scope="col">Petition</th><th scope="col">Notes</th><th scope="col"><span class="visually-hidden">Edit</span></th></tr></thead>
    <tbody>${opts.rows.map(
      (h) => html`<tr>
        <td>${h.label}</td><td>${h.zip}</td><td>${yesNo(h.in_petition_area)}</td><td>${yesNo(h.occupied)}</td><td>${yesNo(h.active)}</td>
        <td>${sigTag(h.pledge_status)}</td><td>${sigTag(h.petition_status)}</td>
        <td class="small">${h.notes ?? ''}</td>
        <td><a href="/admin/households/${h.id}">Edit</a></td>
      </tr>`,
    )}</tbody>
  </table>
  </div>`;
  return adminLayout({ title: 'Households', email: opts.email, active: 'households', body, flash: opts.flash, error: opts.error });
}

export function householdEditPage(opts: { email: string; h: HouseholdRow; error?: string | null; flash?: string | null }): Html {
  const h = opts.h;
  const check = (name: string, label: string, on: number) =>
    html`<div class="field check"><input type="checkbox" id="${name}" name="${name}" value="1"${on ? raw(' checked') : ''}><label for="${name}">${label}</label></div>`;
  const body = html`
  <p><a href="/admin/households">← All households</a></p>
  <form method="post" action="/admin/households/${h.id}" class="admin-form">
    <div class="field"><label for="street_number">House number</label><input id="street_number" name="street_number" value="${h.street_number}" required maxlength="20"></div>
    <div class="field"><label for="street_name">Street</label><input id="street_name" name="street_name" value="${h.street_name}" required maxlength="100"></div>
    <div class="field"><label for="unit">Unit <span class="optional">(optional)</span></label><input id="unit" name="unit" value="${h.unit ?? ''}" maxlength="20"></div>
    <div class="field"><label for="zip">ZIP</label><input id="zip" name="zip" value="${h.zip}" required maxlength="10" inputmode="numeric"></div>
    ${check('in_petition_area', 'In the county’s petition area', h.in_petition_area)}
    ${check('occupied', 'Occupied (untick for vacant homes; they are left out of the 75% denominator)', h.occupied)}
    ${check('active', 'Active (untick to remove from the address list without deleting)', h.active)}
    <div class="field"><label for="notes">Notes</label><textarea id="notes" name="notes" rows="3" maxlength="500">${h.notes ?? ''}</textarea></div>
    <button type="submit" class="button button-primary">Save household</button>
  </form>`;
  return adminLayout({ title: `Edit ${h.label}`, email: opts.email, active: 'households', body, error: opts.error, flash: opts.flash });
}

export function importFormPage(opts: { email: string; error?: string | null }): Html {
  const body = html`
  <p>Upload a CSV with these columns (header row required, any order):</p>
  <pre class="code">street_number,street_name,unit,zip,in_petition_area,occupied,notes
12345,Victory Lakes Loop,,20136,1,1,
12347,Victory Lakes Loop,,20136,1,0,For sale</pre>
  <ul class="small">
    <li><code>street_number</code>, <code>street_name</code> and <code>zip</code> are required.</li>
    <li><code>in_petition_area</code> and <code>occupied</code> take 1/0 or yes/no. Leave blank to keep the current value
      (new homes default to <em>not in area</em> and <em>occupied</em>).</li>
    <li>Rows are matched to existing homes by normalized address, so “Ln” and “Lane” are the same street.</li>
    <li>You will see a preview of every change before anything is saved. Never commit this file to git.</li>
  </ul>
  <form method="post" action="/admin/households/import" enctype="multipart/form-data" class="admin-form">
    <div class="field"><label for="file">CSV file</label><input type="file" id="file" name="file" accept=".csv,text/csv"></div>
    <div class="field"><label for="csv">…or paste CSV text</label><textarea id="csv" name="csv" rows="8"></textarea></div>
    <button type="submit" class="button button-primary">Preview import</button>
  </form>`;
  return adminLayout({ title: 'Import households', email: opts.email, active: 'households', body, error: opts.error });
}

export function importPreviewPage(opts: { email: string; diff: ImportDiff; csv: string; hash: string }): Html {
  const d = opts.diff;
  const nothing = !d.added.length && !d.changed.length;
  const body = html`
  <p><a href="/admin/households/import">← Start over</a></p>
  <div class="cards">
    <section class="card"><h2>New</h2><p class="big-number">${d.added.length}</p></section>
    <section class="card"><h2>Changed</h2><p class="big-number">${d.changed.length}</p></section>
    <section class="card"><h2>Unchanged</h2><p class="big-number">${d.unchanged}</p></section>
    <section class="card"><h2>Errors</h2><p class="big-number">${d.errors.length}</p></section>
  </div>
  ${d.errors.length
    ? html`<section class="panel panel-warn"><h2>Rows with errors (skipped)</h2><ul>${d.errors.map((e) => html`<li>Line ${e.line}: ${e.message}</li>`)}</ul></section>`
    : ''}
  ${d.added.length
    ? html`<section class="panel"><h2>New households</h2><div class="table-scroll"><table class="table compact">
        <thead><tr><th scope="col">Line</th><th scope="col">Address</th><th scope="col">ZIP</th><th scope="col">In area</th><th scope="col">Occupied</th><th scope="col">Notes</th></tr></thead>
        <tbody>${d.added.map((r) => html`<tr><td>${r.line}</td><td>${r.label}</td><td>${r.zip}</td><td>${r.in_petition_area ?? 0}</td><td>${r.occupied ?? 1}</td><td>${r.notes ?? ''}</td></tr>`)}</tbody>
      </table></div></section>`
    : ''}
  ${d.changed.length
    ? html`<section class="panel"><h2>Changes to existing households</h2><div class="table-scroll"><table class="table compact">
        <thead><tr><th scope="col">Line</th><th scope="col">Address</th><th scope="col">Changes</th></tr></thead>
        <tbody>${d.changed.map((c) => html`<tr><td>${c.row.line}</td><td>${c.existing.label}</td><td>${c.changes.map((ch) => html`<div><code>${ch.field}</code>: ${ch.from || '(blank)'} → <strong>${ch.to || '(blank)'}</strong></div>`)}</td></tr>`)}</tbody>
      </table></div></section>`
    : ''}
  ${d.missing.length
    ? html`<section class="panel"><h2>Active households not in this file (${d.missing.length})</h2>
        <p class="small">They stay as they are unless you tick “deactivate” below. Deactivated homes are hidden from the address list; their signatures are kept.</p>
        <ul class="columns small">${d.missing.slice(0, 200).map((h) => html`<li>${h.label}</li>`)}</ul></section>`
    : ''}
  <form method="post" action="/admin/households/import/apply" class="admin-form">
    <textarea name="csv" hidden>${opts.csv}</textarea>
    <input type="hidden" name="hash" value="${opts.hash}">
    ${d.missing.length
      ? html`<div class="field check"><input type="checkbox" id="deactivate_missing" name="deactivate_missing" value="1"><label for="deactivate_missing">Deactivate the ${d.missing.length} households not in this file</label></div>`
      : ''}
    <button type="submit" class="button button-primary"${nothing && !d.missing.length ? raw(' disabled') : ''}>Apply import</button>
  </form>`;
  return adminLayout({ title: 'Import preview', email: opts.email, active: 'households', body });
}
