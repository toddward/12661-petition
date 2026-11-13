import { html, raw } from 'hono/html';
import { brandMark, type Html } from '../layout';

export type AdminSection =
  | 'dashboard'
  | 'signatures'
  | 'paper'
  | 'households'
  | 'petition'
  | 'mode'
  | 'followups'
  | 'export'
  | 'settings'
  | 'audit';

const NAV: { key: AdminSection; href: string; label: string }[] = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard' },
  { key: 'signatures', href: '/admin/signatures', label: 'Signatures' },
  { key: 'paper', href: '/admin/paper', label: 'Paper entry' },
  { key: 'households', href: '/admin/households', label: 'Households' },
  { key: 'petition', href: '/admin/petition', label: 'Petition text' },
  { key: 'mode', href: '/admin/mode', label: 'Mode' },
  { key: 'followups', href: '/admin/followups', label: 'Follow-ups' },
  { key: 'export', href: '/admin/export', label: 'Export & print' },
  { key: 'settings', href: '/admin/settings', label: 'Settings' },
  { key: 'audit', href: '/admin/audit', label: 'Audit log' },
];

export const FLASH_MESSAGES: Record<string, string> = {
  rejected: 'Signature rejected.',
  restored: 'Signature restored.',
  vacant: 'Household marked vacant. It no longer counts toward the total.',
  saved: 'Saved.',
  household_saved: 'Household saved.',
  bulk: 'Petition area updated.',
  imported: 'Import applied.',
  paper: 'Paper signature added.',
  created: 'Draft version created. Review it, then publish.',
  published: 'Version published. It is now the text on the signing form.',
  mode: 'Site mode changed.',
  sent: 'Follow-up batch sent.',
  purged: 'Retention job finished. See the audit log for counts.',
};

export function adminLayout(opts: {
  title: string;
  email: string;
  active: AdminSection;
  body: Html;
  flash?: string | null;
  error?: string | null;
}): Html {
  const flash = opts.flash ? FLASH_MESSAGES[opts.flash] : null;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title} · Admin · Victory Lakes Loop petition</title>
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin">
<a class="skip-link" href="#main">Skip to main content</a>
<header class="admin-header">
  <div class="admin-wrap admin-header-inner">
    <a class="brand" href="/admin">${brandMark}<span>Petition admin</span></a>
    <p class="admin-user">Signed in as <strong>${opts.email}</strong> · <a href="/">View site</a></p>
  </div>
  <nav class="admin-nav" aria-label="Admin">
    <div class="admin-wrap">
      ${NAV.map(
        (n) => html`<a href="${n.href}"${n.key === opts.active ? raw(' aria-current="page"') : ''}>${n.label}</a>`,
      )}
    </div>
  </nav>
</header>
<main id="main" tabindex="-1" class="admin-wrap admin-main">
  <h1>${opts.title}</h1>
  ${flash ? html`<p class="flash flash-ok" role="status">${flash}</p>` : ''}
  ${opts.error ? html`<div class="flash flash-error" role="alert">${opts.error}</div>` : ''}
  ${opts.body}
</main>
</body>
</html>`;
}

/** Builds a query string from defined, non-empty values. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export function yesNo(v: number | boolean | null | undefined): Html {
  return v ? html`<span class="tag tag-yes">Yes</span>` : html`<span class="tag tag-no">No</span>`;
}

export function statusTag(status: string): Html {
  return html`<span class="tag tag-${status}">${status}</span>`;
}
