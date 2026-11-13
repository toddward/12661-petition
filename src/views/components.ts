import { html, raw } from 'hono/html';
import { renderMarkdown } from '../lib/markdown';
import type { PetitionVersion } from '../lib/petition';
import { householdsToGoal, type Progress } from '../lib/progress';
import { formatLocalDate } from '../lib/time';
import { arrowRight } from './icons';
import type { Html } from './layout';

/**
 * The legend's scale bar: an outlined bar with a hatched fill to the current share, a
 * tick at the goal and scale labels. Inline SVG geometry (attributes, not styles) keeps it
 * CSP-clean; colours come from CSS. The tally text next to it carries the same numbers.
 */
export function progressBar(p: Progress): Html {
  const pct = Math.min(100, Math.max(0, p.percent));
  const goal = Math.min(100, Math.max(0, p.goal_percent));
  const W = 1000;
  const x = (v: number) => Math.round((v / 100) * W * 10) / 10;
  const labels: { v: number; text: string; anchor: string; cls?: string }[] = [{ v: 0, text: '0%', anchor: 'start' }];
  if (Math.abs(goal - 50) >= 14) labels.push({ v: 50, text: '50%', anchor: 'middle', cls: 'scale-label-mid' });
  labels.push({ v: goal, text: `${goal}% goal`, anchor: goal > 85 ? 'end' : 'middle' });
  if (goal < 86) labels.push({ v: 100, text: '100%', anchor: 'end', cls: 'scale-label-end' });
  return html`<svg class="scale-bar" viewBox="0 0 ${W} 104" aria-hidden="true" focusable="false">
    <defs><pattern id="pencil" patternUnits="userSpaceOnUse" width="200" height="200"><image href="/img/plates/pencil-vermilion.png" width="200" height="200"/></pattern></defs>
    <rect class="scale-track" x="2" y="2" width="${W - 4}" height="48"/>
    ${pct > 0 ? html`<rect class="scale-fill" x="2" y="2" width="${Math.max(0, x(pct) - 2)}" height="48" fill="url(#pencil)"/>
    <line class="scale-edge" x1="${x(pct)}" y1="2" x2="${x(pct)}" y2="50"/>` : ''}
    <line class="scale-goal" x1="${x(goal)}" y1="2" x2="${x(goal)}" y2="50"/>
    ${labels.map(
      (l) =>
        html`<text class="scale-label${l.cls ? ` ${l.cls}` : ''}" x="${l.anchor === 'start' ? 2 : l.anchor === 'end' ? W - 2 : x(l.v)}" y="100" text-anchor="${l.anchor}">${l.text.toUpperCase()}</text>`,
    )}
  </svg>`;
}

/** The legend box: key, household tally, scale bar, primary action. Never shows names. */
export function legend(p: Progress, cta: { href: string; label: string } | null): Html {
  const verb = p.counted_mode === 'pledge' ? 'pledged' : 'signed';
  const areaSet = p.occupied_total > 0;
  const remaining = householdsToGoal(p);
  return html`<section class="frame legend" aria-labelledby="legend-h">
    <div class="legend-top">
      <div class="legend-keycol">
        <h2 id="legend-h" class="legend-label">Legend</h2>
        <p class="legend-key"><span class="key-swatch" aria-hidden="true"></span>Study area (illustration)</p>
      </div>
      <div class="legend-tally">
        ${areaSet
          ? html`<p class="tally"><span class="tally-num">${p.signed}</span> <span class="tally-of">of</span> <span class="tally-num">${p.occupied_total}</span>
              <span class="tally-unit">households ${verb} · Goal ${p.goal_percent}%</span></p>`
          : html`<p class="tally-pending">Progress will appear once the petition area is set.</p>`}
      </div>
    </div>
    ${areaSet ? progressBar(p) : ''}
    ${cta
      ? html`<a class="button button-primary button-block" href="${cta.href}">${cta.label}${arrowRight}</a>
        <p class="legend-note">About 2 minutes. One per household.</p>`
      : ''}
    ${areaSet
      ? p.mode === 'closed'
        ? html`<p class="legend-status">Final count: ${p.percent}%. Signatures are closed.</p>`
        : remaining > 0
          ? html`<p class="legend-status">${p.percent}% so far. ${remaining} more ${remaining === 1 ? 'household' : 'households'} to reach ${p.goal_percent}%.</p>`
          : html`<p class="legend-status"><strong>Goal reached.</strong> Thank you, neighbors.</p>`
      : ''}
    ${p.counted_mode === 'pledge'
      ? html`<p class="legend-fine">Pledges show support. They do not count toward the county’s ${p.goal_percent}%.</p>`
      : ''}
  </section>`;
}

export function petitionStatement(v: PetitionVersion): Html {
  return html`<section class="frame statement" aria-labelledby="statement-h">
    <h2 id="statement-h">${v.title}</h2>
    <div class="statement-body">${raw(renderMarkdown(v.body_markdown))}</div>
    <p class="statement-meta">Text version <span class="mono-num">${v.sha256.slice(0, 8)}</span>${v.published_at ? html`, published ${formatLocalDate(v.published_at)}` : ''}.${v.mode === 'pledge' ? ' This is a pledge, not the county’s petition.' : ''}</p>
  </section>`;
}
