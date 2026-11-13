import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { Settings } from '../lib/settings';

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export const SITE_NAME = 'Slow Down on Victory Lakes Loop';

/** Small inline brand mark: a raised speed table seen from the side. Decorative. */
export const brandMark = raw(
  `<svg class="brand-mark" viewBox="0 0 40 24" width="40" height="24" aria-hidden="true" focusable="false"><path d="M2 19h8l5-7h10l5 7h8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M17 15.5h2.5M21.5 15.5H24" stroke="#f2b705" stroke-width="2.5" stroke-linecap="round"/></svg>`,
);

export function contactLinks(s: Settings): Html {
  const parts: Html[] = [];
  if (s.organizer_email)
    parts.push(html`<a href="mailto:${s.organizer_email}">${s.organizer_email}</a>`);
  if (s.organizer_phone)
    parts.push(html`<a href="tel:${s.organizer_phone.replace(/[^\d+]/g, '')}">${s.organizer_phone}</a>`);
  if (!parts.length) return html`<span class="muted">contact details coming soon</span>`;
  return html`${parts.map((p, i) => html`${i ? ' or ' : ''}${p}`)}`;
}

export function publicLayout(opts: {
  title: string;
  settings: Settings;
  body: Html;
  description?: string;
  scripts?: string[];
  active?: 'home' | 'sign' | 'faq' | 'privacy';
}): Html {
  const { title, settings: s, body, active } = opts;
  const desc =
    opts.description ??
    'Neighbors asking Prince William County for speed tables on Victory Lakes Loop. A resident-run petition.';
  const navItem = (href: string, label: string, key: typeof active) =>
    html`<a href="${href}"${key === active ? raw(' aria-current="page"') : ''}>${label}</a>`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${SITE_NAME}</title>
<meta name="description" content="${desc}">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css">
${(opts.scripts ?? []).map((src) => html`<script src="${src}" defer></script>`)}
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">${brandMark}<span>Slow Down on<br><strong>Victory Lakes Loop</strong></span></a>
    <nav aria-label="Main">
      ${navItem('/faq', 'FAQ', 'faq')}
      ${active !== 'sign' ? html`<a class="nav-cta" href="/sign">Sign</a>` : ''}
    </nav>
  </div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p><strong>A resident-run site.</strong> This is not an official site of Prince William County, VDOT or the HOA.
    Run by ${s.organizer_name}, a Victory Lakes neighbor: ${contactLinks(s)}.</p>
    <p class="footer-links">${navItem('/privacy', 'Privacy notice', 'privacy')} ${navItem('/faq', 'FAQ', 'faq')} <a href="/">Home</a></p>
  </div>
</footer>
</body>
</html>`;
}

export function simplePage(settings: Settings, title: string, message: Html, extra?: Html): Html {
  return publicLayout({
    title,
    settings,
    body: html`<div class="wrap narrow page-pad"><h1>${title}</h1>${message}${extra ?? ''}</div>`,
  });
}
