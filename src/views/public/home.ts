import { html } from 'hono/html';
import type { SiteMode } from '../../env';
import type { Progress } from '../../lib/progress';
import type { Settings } from '../../lib/settings';
import { progressBlock } from '../components';
import { contactLinks, publicLayout, type Html } from '../layout';

export function signCtaLabel(mode: SiteMode): string {
  return mode === 'petition' ? 'Sign the petition' : 'Sign the pledge';
}

export function homePage(opts: { settings: Settings; progress: Progress; src: string | null; canSign: boolean }): Html {
  const { settings: s, progress, src } = opts;
  const mode = s.site_mode;
  const signHref = src ? `/sign?src=${encodeURIComponent(src)}` : '/sign';

  const status: Html =
    mode === 'pledge'
      ? html`<p>We are collecting <strong>pledges of support</strong> now, before the county issues its petition.
          A pledge tells the HOA board and the county that neighbors want this. It is not the county’s petition,
          so when the county’s petition is ready we will ask your household to sign that too.</p>`
      : mode === 'petition'
        ? html`<p><strong>The county’s petition is open.</strong> One adult signs for each household, owner or renter.
            The county needs ${s.goal_percent}% of occupied households in the petition area.</p>`
        : html`<p><strong>Signatures are closed.</strong> Thank you to every household that took part.
            The organizer will post updates here as the county reviews the request.</p>`;

  const body = html`
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="kicker">A neighbor-led request to Prince William County</p>
      <h1>Let’s slow traffic on Victory Lakes Loop.</h1>
      <p class="lead">Neighbors are asking the county to install <strong>speed tables</strong>: long, flat-topped bumps
        that keep drivers at a safe speed, every day and every night.</p>
      ${opts.canSign
        ? html`<p class="hero-actions"><a class="button button-primary" href="${signHref}">${signCtaLabel(mode)}</a>
            <span class="muted small">About 2 minutes. One per household.</span></p>`
        : ''}
    </div>
    <div class="hero-progress">${progressBlock(progress)}</div>
  </div>
  <div class="road-stripe" aria-hidden="true"></div>
</section>

<div class="wrap content">
  <section class="section" aria-labelledby="now-h">
    <h2 id="now-h">Where things stand</h2>
    ${status}
  </section>

  <section class="section" aria-labelledby="why-h">
    <h2 id="why-h">Why this matters</h2>
    <ul class="reasons">
      <li><strong>Kids are on this road.</strong> Children walk along the loop and wait at the curb for school buses.</li>
      <li><strong>Speeding keeps happening.</strong> Drivers regularly go well over the limit, and neighbors have seen near misses.</li>
      <li><strong>Signs have not fixed it.</strong> Speed tables slow every car, every time, without anyone having to enforce it.</li>
    </ul>
  </section>

  <section class="section" aria-labelledby="what-h">
    <h2 id="what-h">What we are asking for</h2>
    <p>Physical speed tables on Victory Lakes Loop, installed through Prince William County’s
      <strong>Residential Traffic Management program</strong>. Not more signs. Speed tables are longer and gentler
      than speed bumps, so cars pass over them smoothly at a safe speed.</p>
  </section>

  <section class="section" aria-labelledby="how-h">
    <h2 id="how-h">How the county process works</h2>
    <ol class="steps">
      <li><h3>HOA board</h3><p>The HOA board is considering whether to support the request. Its decision is expected on December 22.</p></li>
      <li><h3>County speed study</h3><p>The county measures traffic speed and volume to confirm the street qualifies, then drafts a plan.</p></li>
      <li><h3>Petition</h3><p>The county sets the petition area and provides the petition. At least ${s.goal_percent}% of occupied
        households in that area must sign. One signature per household, and renters can sign.</p></li>
      <li><h3>County approval</h3><p>The county checks the petition and sends the request on for approval and installation.</p></li>
    </ol>
  </section>

  <section class="section talk" aria-labelledby="talk-h">
    <h2 id="talk-h">Want to talk it over?</h2>
    <p>${s.organizer_name} organizes this effort and is happy to meet in person, answer questions,
      or help you sign on paper. Reach out: ${contactLinks(s)}.</p>
    ${opts.canSign
      ? html`<p><a class="button button-primary" href="${signHref}">${signCtaLabel(mode)}</a></p>`
      : ''}
  </section>
</div>`;

  return publicLayout({ title: 'Speed tables for Victory Lakes Loop', settings: s, body, active: 'home' });
}
