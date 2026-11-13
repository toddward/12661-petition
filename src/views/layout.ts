import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { Settings } from '../lib/settings';
import { markIcon } from './icons';

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export const SITE_NAME = 'Slow Down on Victory Lakes Loop';

/** Kept for the admin header. */
export const brandMark = markIcon;

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
  /** Extra class on <body>, e.g. "page-home". */
  bodyClass?: string;
}): Html {
  const { title, settings: s, body, active } = opts;
  const desc =
    opts.description ??
    'Neighbors asking Prince William County for speed tables on Victory Lakes Loop. A resident-run petition.';
  const current = (key: typeof active) => (key === active ? raw(' aria-current="page"') : raw(''));
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${SITE_NAME}</title>
<meta name="description" content="${desc}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f7f7f3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1a27" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/barlow-semi-condensed-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/barlow-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css">
${(opts.scripts ?? []).map((src) => html`<script src="${src}" defer></script>`)}
</head>
<body${opts.bodyClass ? html` class="${opts.bodyClass}"` : ''}>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${SITE_NAME}, home">${markIcon}</a>
    <a class="site-name" href="/"${current('home')}><span>Slow down on</span> <span>Victory Lakes Loop</span></a>
    ${active === 'sign' ? html`<span class="header-spacer" aria-hidden="true"></span>` : html`<a class="header-sign" href="/sign">Sign</a>`}
  </div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <p><strong>A resident-run site.</strong> Not an official site of Prince William County, VDOT or the HOA.
    Organized by ${s.organizer_name}, a Victory Lakes neighbor: ${contactLinks(s)}.</p>
    <nav class="footer-links" aria-label="Footer">
      <a href="/"${current('home')}>Home</a>
      <a href="/faq"${current('faq')}>Questions</a>
      <a href="/privacy"${current('privacy')}>Privacy notice</a>
    </nav>
  </div>
</footer>
</body>
</html>`;
}

export function simplePage(settings: Settings, title: string, message: Html, extra?: Html): Html {
  return publicLayout({
    title,
    settings,
    body: html`<div class="wrap narrow page-pad"><div class="sheet"><h1>${title}</h1>${message}${extra ?? ''}</div></div>`,
  });
}
