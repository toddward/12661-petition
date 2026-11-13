import { html, raw } from 'hono/html';
import type { SiteMode } from '../../env';
import type { Progress } from '../../lib/progress';
import type { Settings } from '../../lib/settings';
import { legend } from '../components';
import { arrowRight, star } from '../icons';
import { contactLinks, publicLayout, type Html } from '../layout';

export function signCtaLabel(mode: SiteMode): string {
  return mode === 'petition' ? 'Sign the petition' : 'Sign the pledge';
}

const STEPS: { title: string; text: (goal: number) => string }[] = [
  { title: 'HOA board', text: () => 'The HOA board considers supporting the request. Its decision is expected on December 22.' },
  { title: 'County speed study', text: () => 'The county measures speed and traffic to confirm the street qualifies, then drafts a plan.' },
  {
    title: 'Petition',
    text: (g) =>
      `The county sets the petition area and provides the petition. At least ${g}% of occupied households there must sign. One signature per household; renters can sign.`,
  },
  { title: 'County approval', text: () => 'The county checks the petition and sends the request on for approval and installation.' },
];

/** Which step of the county process we are on, from the site mode. */
function currentStep(mode: SiteMode): number {
  return mode === 'pledge' ? 0 : mode === 'petition' ? 2 : 3;
}

export function homePage(opts: { settings: Settings; progress: Progress; src: string | null; canSign: boolean }): Html {
  const { settings: s, progress, src } = opts;
  const mode = s.site_mode;
  const signHref = src ? `/sign?src=${encodeURIComponent(src)}` : '/sign';
  const cta = opts.canSign ? { href: signHref, label: signCtaLabel(mode) } : null;
  const step = currentStep(mode);

  const standing: Html =
    mode === 'pledge'
      ? html`<p>We are collecting <strong>pledges</strong> now, before the county issues its petition. A pledge tells the HOA board and the
          county that neighbors want this. It is not the county’s petition, so when that is ready we will ask your household to sign it too.</p>`
      : mode === 'petition'
        ? html`<p><strong>The county’s petition is open.</strong> One adult signs for each household, owner or renter.</p>`
        : html`<p><strong>Signatures are closed.</strong> Thank you to every household that took part. We will post updates here as the county reviews the request.</p>`;

  const body = html`
<div class="wrap home">
  <div class="home-lead">
    <figure class="plat">
      <img src="/img/plates/plat-420.png" srcset="/img/plates/plat-420.png 420w, /img/plates/plat-840.png 840w"
        sizes="(min-width: 960px) 560px, calc(100vw - 32px)" width="840" height="731" fetchpriority="high"
        alt="Illustrated plat of Victory Lakes Loop: the road curving around a lake, lots on both sides, side streets, and a red line around the area.">
      <figcaption>Illustration only. The county sets the real petition area.</figcaption>
    </figure>

    <div class="home-side">
      <section class="frame title-block" aria-labelledby="page-title">
        <h1 id="page-title">Let’s slow traffic on Victory Lakes Loop.</h1>
        <p class="title-sub">Neighbors are asking Prince William County for speed tables so <em class="pencil">kids</em> can walk and wait safely.</p>
      </section>

      ${legend(progress, cta)}
    </div>
  </div>

  <div class="home-sections">
    <section class="frame why" aria-labelledby="why-h">
      <h2 id="why-h" class="ruled-heading">${star}Why this matters</h2>
      <ul class="reasons">
        <li>
          <img src="/img/plates/icon-bus-280.png" width="140" height="70" alt="">
          <div><h3>Kids walk here. Buses stop here.</h3>
          <p>Children walk along the loop and wait at the curb for school buses every day.</p></div>
        </li>
        <li>
          <img src="/img/plates/icon-car-280.png" width="140" height="70" alt="">
          <div><h3>Traffic moves too fast.</h3>
          <p>Drivers regularly go well over the limit, and neighbors have seen near misses. Speed tables slow every car, every time.</p></div>
        </li>
      </ul>
    </section>

    <section class="frame frame-open ask" aria-labelledby="ask-h">
      <h2 id="ask-h" class="ruled-heading">What we are asking for</h2>
      <p>Physical speed tables on Victory Lakes Loop, installed through Prince William County’s <strong>Residential Traffic
        Management program</strong>. Not more signs. Speed tables are longer and gentler than speed bumps, so cars pass over
        them smoothly at a safe speed.</p>
    </section>

    <section class="frame frame-open process" aria-labelledby="how-h">
      <h2 id="how-h" class="ruled-heading">How the county process works</h2>
      <ol class="sheet-notes">
        ${STEPS.map(
          (st, i) => html`<li${i === step ? raw(' class="is-current" aria-current="step"') : ''}>
            <span class="note-num" aria-hidden="true">${i + 1}</span>
            <div><h3>${i === step ? html`<span class="here">We are here:</span> ` : ''}${st.title}</h3><p>${st.text(s.goal_percent)}</p></div>
          </li>`,
        )}
      </ol>
      <div class="standing">${standing}</div>
    </section>

    <section class="frame frame-open talk" aria-labelledby="talk-h">
      <h2 id="talk-h" class="ruled-heading">Want to talk it over?</h2>
      <p>${s.organizer_name} organizes this effort and is happy to meet in person, answer questions, or help you sign on paper.
        Reach out: ${contactLinks(s)}.</p>
      ${cta ? html`<p><a class="button button-primary" href="${cta.href}">${cta.label}${arrowRight}</a></p>` : ''}
    </section>
  </div>
</div>`;

  return publicLayout({
    title: 'Speed tables for Victory Lakes Loop',
    settings: s,
    body,
    active: 'home',
    bodyClass: 'page-home',
  });
}
