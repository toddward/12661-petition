import { html, raw } from 'hono/html';
import { renderMarkdown } from '../../lib/markdown';
import type { PetitionVersion } from '../../lib/petition';
import { RELATIONSHIP_LABELS } from '../../lib/signatures';
import { formatLocalDate } from '../../lib/time';
import type { Html } from '../layout';

export interface PrintRow {
  household_label: string;
  full_name: string | null;
  typed_signature: string | null;
  relationship: string | null;
  signed_at: string | null;
  entry_method: string | null;
  petition_version_sha256: string | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out.length ? out : [[]];
}

/**
 * Printer-friendly petition pages (spec §10.2). Pagination is done on the server so the
 * petition title and full language repeat at the top of every page and "Page X of Y" is
 * exact in every browser.
 */
export function printPage(opts: {
  version: PetitionVersion;
  rows: PrintRow[];
  perPage: number;
  blank: boolean;
  generatedAt: string;
}): Html {
  const { version: v, blank } = opts;
  const pages = chunk(opts.rows, opts.perPage);
  const total = pages.length;
  const statement = raw(renderMarkdown(v.body_markdown));
  const otherVersions = new Set(opts.rows.map((r) => r.petition_version_sha256).filter((h) => h && h !== v.sha256));

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${v.title}: ${blank ? 'signature sheet' : 'signatures'}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/css/print.css">
</head>
<body class="print-body">
<div class="print-toolbar no-print">
  <p><a href="/admin/export">← Back to admin</a> · ${opts.rows.length} ${blank ? 'addresses' : 'signatures'} on ${total} ${total === 1 ? 'page' : 'pages'}.
  Use your browser’s Print command. ${otherVersions.size ? html`<strong>Warning:</strong> some rows were signed under a different text version than the one printed.` : ''}</p>
</div>
${pages.map(
  (rows, i) => html`<section class="print-page">
  <header class="print-header">
    <h1>${v.title}</h1>
    <div class="print-statement">${statement}</div>
    <p class="print-attest">${v.attestation_text}</p>
  </header>
  <table class="print-table">
    <thead><tr>
      <th scope="col" class="c-n">#</th>
      <th scope="col" class="c-addr">Household address</th>
      <th scope="col" class="c-name">Printed name</th>
      <th scope="col" class="c-sig">Signature</th>
      <th scope="col" class="c-rel">Owner / renter</th>
      <th scope="col" class="c-date">Date signed</th>
    </tr></thead>
    <tbody>${rows.map(
      (r, j) => html`<tr>
        <td class="c-n">${i * opts.perPage + j + 1}</td>
        <td class="c-addr">${r.household_label}</td>
        <td class="c-name">${r.full_name ?? ''}</td>
        <td class="c-sig">${blank ? '' : r.entry_method === 'paper' ? html`<em>signed on paper</em>` : html`<span class="typed-sig">/s/ ${r.typed_signature ?? ''}</span>`}</td>
        <td class="c-rel">${r.relationship ? (RELATIONSHIP_LABELS[r.relationship] ?? r.relationship) : ''}</td>
        <td class="c-date">${r.signed_at ? formatLocalDate(r.signed_at) : ''}</td>
      </tr>`,
    )}</tbody>
  </table>
  <footer class="print-footer">
    <span>Text version ${v.sha256.slice(0, 12)}${blank ? '' : ' · typed signatures submitted online are marked /s/'}</span>
    <span>Page ${i + 1} of ${total}</span>
  </footer>
</section>`,
)}
</body>
</html>`;
}
