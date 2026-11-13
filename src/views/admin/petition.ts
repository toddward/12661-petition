import { html, raw } from 'hono/html';
import type { Mode, SiteMode } from '../../env';
import type { PetitionVersion } from '../../lib/petition';
import { formatLocalShort } from '../../lib/time';
import { petitionStatement } from '../components';
import type { Html } from '../layout';
import { arrowLeft } from '../icons';
import { adminLayout } from './layout';

export function versionListPage(opts: { email: string; versions: PetitionVersion[]; siteMode: SiteMode; flash?: string | null }): Html {
  const body = html`
  <p>Every signature records the exact text version it was signed under. Published versions cannot be edited:
  to change the text, create a new version. Publishing a new version makes any open signing form ask the signer to review and sign again.</p>
  <p><a class="button button-primary" href="/admin/petition/new">New version</a></p>
  <div class="table-scroll"><table class="table">
    <thead><tr><th scope="col">Title</th><th scope="col">Mode</th><th scope="col">SHA-256</th><th scope="col">Created</th><th scope="col">Published</th><th scope="col">Status</th></tr></thead>
    <tbody>${opts.versions.map(
      (v) => html`<tr>
        <td><a href="/admin/petition/${v.id}">${v.title}</a></td>
        <td>${v.mode}</td>
        <td><code>${v.sha256.slice(0, 12)}</code></td>
        <td>${formatLocalShort(v.created_at)}</td>
        <td>${v.published_at ? formatLocalShort(v.published_at) : html`<span class="muted">draft</span>`}</td>
        <td>${v.active ? html`<span class="tag tag-active">active</span>` : v.published_at ? html`<span class="tag">retired</span>` : html`<span class="tag">draft</span>`}</td>
      </tr>`,
    )}</tbody>
  </table></div>`;
  return adminLayout({ title: 'Petition text', email: opts.email, active: 'petition', body, flash: opts.flash });
}

export interface VersionFormValues {
  mode: Mode;
  title: string;
  body: string;
  attestation: string;
  source_note: string;
}

export function versionFormPage(opts: { email: string; values: VersionFormValues; error?: string | null }): Html {
  const v = opts.values;
  const body = html`
  <p><a class="back-link" href="/admin/petition">${arrowLeft}All versions</a></p>
  <form method="post" action="/admin/petition" class="admin-form wide">
    <fieldset class="field"><legend>Mode</legend>
      <div class="radio"><input type="radio" id="mode_pledge" name="mode" value="pledge"${v.mode === 'pledge' ? raw(' checked') : ''}><label for="mode_pledge">Pledge (support only, organizer wording)</label></div>
      <div class="radio"><input type="radio" id="mode_petition" name="mode" value="petition"${v.mode === 'petition' ? raw(' checked') : ''}><label for="mode_petition">Petition (county wording, verbatim)</label></div>
    </fieldset>
    <div class="field"><label for="title">Title</label><input id="title" name="title" value="${v.title}" required maxlength="200"></div>
    <div class="field"><label for="body">Text (Markdown: paragraphs, **bold**, *italic*, lists, headings)</label>
      <p class="hint">In petition mode paste the county’s language exactly as provided.</p>
      <textarea id="body" name="body" rows="14" required maxlength="20000">${v.body}</textarea></div>
    <div class="field"><label for="attestation">Attestation (shown next to the “I live at this address” checkbox)</label>
      <textarea id="attestation" name="attestation" rows="2" required maxlength="500">${v.attestation}</textarea></div>
    <div class="field"><label for="source_note">Source note</label>
      <p class="hint">Where the text came from, e.g. “Text provided by PWC DOT, email of 2027-01-15”.</p>
      <input id="source_note" name="source_note" value="${v.source_note}" maxlength="300"></div>
    <button type="submit" class="button button-primary">Save draft and preview</button>
  </form>`;
  return adminLayout({ title: 'New petition version', email: opts.email, active: 'petition', body, error: opts.error });
}

export function versionDetailPage(opts: {
  email: string;
  v: PetitionVersion;
  signatureCount: number;
  siteMode: SiteMode;
  flash?: string | null;
}): Html {
  const v = opts.v;
  const body = html`
  <p><a class="back-link" href="/admin/petition">${arrowLeft}All versions</a></p>
  <dl class="detail">
    <div><dt>Mode</dt><dd>${v.mode}</dd></div>
    <div><dt>Status</dt><dd>${v.active ? 'active' : v.published_at ? 'retired' : 'draft'}</dd></div>
    <div><dt>SHA-256</dt><dd><code class="break">${v.sha256}</code></dd></div>
    <div><dt>Source</dt><dd>${v.source_note ?? '—'}</dd></div>
    <div><dt>Created</dt><dd>${formatLocalShort(v.created_at)}</dd></div>
    <div><dt>Published</dt><dd>${v.published_at ? formatLocalShort(v.published_at) : '—'}</dd></div>
    <div><dt>Signatures under this text</dt><dd>${opts.signatureCount}</dd></div>
  </dl>
  <h2>Preview (as shown on the signing form)</h2>
  <div class="preview">${petitionStatement(v)}
    <div class="field check"><input type="checkbox" id="preview-attest" disabled><label for="preview-attest">${v.attestation_text}</label></div>
  </div>
  <p>
    ${v.active ? '' : html`<a class="button button-primary" href="/admin/petition/${v.id}/publish">Publish this version…</a>`}
    <a class="button" href="/admin/petition/new?from=${v.id}">Copy into a new version</a>
  </p>`;
  return adminLayout({ title: v.title, email: opts.email, active: 'petition', body, flash: opts.flash });
}

export function publishConfirmPage(opts: { email: string; v: PetitionVersion; current: PetitionVersion | null; siteMode: SiteMode }): Html {
  const { v, current, siteMode } = opts;
  const switches = siteMode !== 'closed' && siteMode !== v.mode;
  const body = html`
  <section class="panel panel-warn">
    <h2>Publish “${v.title}”?</h2>
    <ul>
      <li>This text replaces ${current ? html`“${current.title}”` : 'nothing (no text is active)'} on the signing form.</li>
      <li>Anyone with the form open will be asked to review the new text and sign again.</li>
      <li>Existing signatures keep the version they were signed under.</li>
      ${switches
        ? html`<li><strong>The site switches from ${siteMode} mode to ${v.mode} mode.</strong>
            ${v.mode === 'petition' ? html` Pledges are <strong>not</strong> converted into signatures. Use <a href="/admin/followups">Follow-ups</a> to invite opted-in pledgers to sign.` : ''}</li>`
        : ''}
      ${siteMode === 'closed' ? html`<li>The site stays closed. Change the mode separately if you want to reopen signing.</li>` : ''}
      <li>Published versions cannot be edited afterwards.</li>
    </ul>
    <form method="post" action="/admin/petition/${v.id}/publish">
      <button type="submit" class="button button-primary">Yes, publish</button>
      <a href="/admin/petition/${v.id}">Cancel</a>
    </form>
  </section>`;
  return adminLayout({ title: 'Confirm publish', email: opts.email, active: 'petition', body });
}
