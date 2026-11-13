# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Cloudflare Workers (Hono, server-rendered TypeScript templates) + D1 + Turnstile + Cloudflare Access, deployed with Wrangler. Fixed by the build spec (`docs/SPEC.md` §2). Plain CSS and small vanilla JS served as static assets; no front-end framework.

## Users

- **Residents of Victory Lakes (Bristow, VA)**, mostly reached by a QR code on a paper mailer, opening the site on a phone. One adult per household signs or pledges. Owners and renters both count. Includes older residents who may not confirm email or may prefer paper. Job: understand what is being asked, trust that it is legitimate, and sign in under two minutes.
- **The organizer (Todd Wardzinski) and up to a few co-organizers**, using the admin area on a laptop. Job: watch progress against the county's 75% threshold, review suspicious entries, enter paper signatures, manage the household list once the county defines the petition area, and export or print a county-ready petition.

## Product Purpose

A resident-run site supporting a petition to Prince William County for physical traffic calming (speed tables) on Victory Lakes Loop, under the county's Residential Traffic Management program. It collects one signature (or, before the county issues its petition, one pledge) per household, shows public progress toward 75% of occupied households, and produces exports the county can verify.

Success: enough households sign the county's petition (or the HOA board resolution makes it unnecessary) and the county accepts the result.

## Positioning

A neighbor-run tool built around the county's actual rules (one signature per household, county-defined petition area, versioned county wording on every page, 12-month validity), not a generic petition platform. It is explicitly **not** an official county, VDOT or HOA site and must never look like one.

## Operating Context

- Paper mailer with a QR code to `/?src=mailer` reaches every HOA household; only petition-area households count.
- Modes: `pledge` (launch; support only, does not count toward 75%), `petition` (county wording, only counts if PWC DOT accepts e-signatures), `closed`.
- HOA board decision expected December 22, 2026; county speed study and petition-area definition come after.
- Paper signing remains a fallback; the organizer types paper forms into the admin.

## Capabilities and Constraints

- Strict CSP: no inline styles or scripts; only Turnstile as a third-party script; no analytics; system or self-hosted fonts.
- Page weight under 150 KB excluding Turnstile; works at 320 px; form works without JS except Turnstile.
- Signer names are never public. IP address is logged and disclosed in the privacy notice.
- Open decisions (spec §12): whether the county accepts electronic signatures, address list source, domain and public contact email, email provider, admin emails, retention periods.

## Brand Commitments

- Voice: collective **"we, your neighbors"**, with Todd named as the organizer and contact. Plain language, about an 8th-grade reading level.
- No county, VDOT or HOA logos or official-looking seals.

## Evidence on Hand

- No measured speeds, studies, photos or testimonials yet. Keep claims general (children walking and waiting for buses, repeated speeding, near misses). Do not fabricate numbers, quotes or stories.
- Neighbor first-hand accounts may be added later, with consent; the site should be able to show them when they exist.

## Product Principles

1. Trust before persuasion: say plainly who runs this, what is collected and what a signature does and does not do.
2. The county's rules are the product: never imply a pledge counts as a signature, or that the site decides eligibility.
3. Two minutes on a phone: every step of signing is designed for one thumb and a mailer in the other hand.
4. Privacy by default: show counts, never people.
5. Paper is a first-class path, not a failure.

## Accessibility & Inclusion

WCAG 2.1 AA; Lighthouse accessibility ≥ 95 and no serious axe violations on `/` and `/sign`. 16 px minimum body text, 44 × 44 px targets, visible focus, `prefers-reduced-motion` and `prefers-color-scheme` respected. Older residents are a core audience.
