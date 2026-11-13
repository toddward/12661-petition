import { html, raw } from 'hono/html';
import { renderMarkdown } from '../lib/markdown';
import type { PetitionVersion } from '../lib/petition';
import { householdsToGoal, type Progress } from '../lib/progress';
import { formatLocalDate } from '../lib/time';
import type { Html } from './layout';

/**
 * Progress bar as inline SVG (geometry via attributes, colours via CSS) so it works under
 * a strict CSP with no inline styles. The visible text carries the same information.
 */
export function progressBar(p: Progress): Html {
  const pct = Math.min(100, Math.max(0, p.percent));
  const goal = Math.min(100, Math.max(0, p.goal_percent));
  return html`<svg class="progress-svg" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect class="progress-track" x="0" y="0" width="100" height="8" rx="0"/>
    <rect class="progress-fill" x="0" y="0" width="${pct}" height="8"/>
    <rect class="progress-goal" x="${Math.max(0, goal - 0.4)}" y="0" width="0.8" height="8"/>
  </svg>`;
}

export function progressBlock(p: Progress, opts: { compact?: boolean } = {}): Html {
  const verb = p.counted_mode === 'pledge' ? 'pledged' : 'signed';
  if (p.occupied_total <= 0) {
    return html`<section class="progress-card" aria-labelledby="progress-h">
      <h2 id="progress-h" class="progress-title">Progress</h2>
      <p class="progress-pending">Progress will appear once the petition area is set.</p>
      ${opts.compact
        ? ''
        : html`<p class="muted small">Prince William County decides which homes are in the petition area. We will show the count as soon as it does.</p>`}
    </section>`;
  }
  const remaining = householdsToGoal(p);
  return html`<section class="progress-card" aria-labelledby="progress-h">
    <h2 id="progress-h" class="progress-title">Progress</h2>
    <p class="progress-figures"><span class="progress-big">${p.percent}%</span>
      <span><strong>${p.signed}</strong> of <strong>${p.occupied_total}</strong> households ${verb}</span></p>
    <div class="progress-bar">${progressBar(p)}
      <span class="progress-goal-label">Goal: ${p.goal_percent}%</span>
    </div>
    ${p.mode === 'closed'
      ? html`<p class="small">Final count. Signatures are closed.</p>`
      : remaining > 0
        ? html`<p class="small">${remaining} more ${remaining === 1 ? 'household' : 'households'} needed to reach ${p.goal_percent}%.</p>`
        : html`<p class="small"><strong>Goal reached.</strong> Thank you, neighbors.</p>`}
    ${p.counted_mode === 'pledge'
      ? html`<p class="muted small">Pledges show support. They do not count toward the county’s ${p.goal_percent}% requirement.</p>`
      : ''}
  </section>`;
}

export function petitionStatement(v: PetitionVersion, opts: { headingLevel?: 2 | 3 } = {}): Html {
  const h = opts.headingLevel ?? 2;
  const heading = h === 2 ? html`<h2 id="statement-h">${v.title}</h2>` : html`<h3 id="statement-h">${v.title}</h3>`;
  return html`<section class="statement" aria-labelledby="statement-h">
    ${heading}
    <div class="statement-body">${raw(renderMarkdown(v.body_markdown))}</div>
    <p class="statement-meta">Text version <code>${v.sha256.slice(0, 8)}</code>${v.published_at ? html`, published ${formatLocalDate(v.published_at)}` : ''}.
    ${v.mode === 'pledge' ? html` This is a pledge, not the county’s petition.` : ''}</p>
  </section>`;
}
