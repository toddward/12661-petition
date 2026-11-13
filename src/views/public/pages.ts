import { html } from 'hono/html';
import type { Mode } from '../../env';
import type { Settings } from '../../lib/settings';
import { RELATIONSHIP_LABELS, type SignatureWithAddress } from '../../lib/signatures';
import { formatLongDate } from '../../lib/time';
import { check } from '../icons';
import { contactLinks, publicLayout, simplePage, type Html } from '../layout';

export function thanksPage(settings: Settings, mode: Mode, emailOn: boolean): Html {
  const what = mode === 'pledge' ? 'pledge' : 'signature';
  const body = html`<div class="wrap narrow page-pad">
    <div class="sheet">
    <div class="success-mark">${check}</div>
    <h1>Thank you for your ${what}.</h1>
    <p class="lead">Your household’s ${what} has been recorded.</p>
    <h2>What happens next</h2>
    ${mode === 'pledge'
      ? html`<ul>
          <li>Your pledge shows the HOA board and the county that neighbors want speed tables.</li>
          <li>A pledge is not the county’s petition. When the county issues its petition, we will ask your household to sign that too.</li>
          <li>Please tell your neighbors. Every household counts.</li>
        </ul>`
      : html`<ul>
          <li>The organizer will submit the petition to Prince William County DOT once enough households have signed.</li>
          <li>The county checks every petition before it moves forward.</li>
          <li>Please tell your neighbors. The county needs ${settings.goal_percent}% of occupied households.</li>
        </ul>`}
    <h2>Changed your mind?</h2>
    ${emailOn
      ? html`<p>We are sending you a confirmation email. Please click the link in it to confirm your address.
          The email also has a link to withdraw your ${what} at any time. If it does not arrive in a few minutes, check your spam folder.</p>`
      : html`<p>To withdraw your ${what}, contact the organizer: ${contactLinks(settings)}.</p>`}
    <p><a class="button" href="/">Back to the home page</a></p>
    </div>
  </div>`;
  return publicLayout({ title: 'Thank you', settings, body });
}

export function confirmPage(settings: Settings, ok: boolean): Html {
  return ok
    ? simplePage(
        settings,
        'Email confirmed',
        html`<p>Thanks. Your email address is confirmed.</p><p><a href="/">Back to the home page</a></p>`,
      )
    : invalidLinkPage(settings);
}

export function invalidLinkPage(settings: Settings): Html {
  return simplePage(
    settings,
    'This link does not work',
    html`<p>The link may be incomplete or out of date. Try copying the whole link from your email.</p>
      <p>Still stuck? Contact the organizer: ${contactLinks(settings)}.</p>`,
  );
}

function summary(sig: SignatureWithAddress): Html {
  return html`<dl class="summary">
    <div><dt>Name</dt><dd>${sig.full_name}</dd></div>
    <div><dt>Address</dt><dd>${sig.household_label}</dd></div>
    <div><dt>Date</dt><dd>${formatLongDate(sig.signed_at)}</dd></div>
    <div><dt>Type</dt><dd>${sig.mode === 'pledge' ? 'Pledge of support' : 'Petition signature'}</dd></div>
    <div><dt>Relationship</dt><dd>${RELATIONSHIP_LABELS[sig.relationship] ?? sig.relationship}</dd></div>
  </dl>`;
}

export function withdrawPage(settings: Settings, sig: SignatureWithAddress, token: string, done = false): Html {
  const what = sig.mode === 'pledge' ? 'pledge' : 'signature';
  let content: Html;
  if (done) {
    content = html`<p class="lead">Your ${what} has been withdrawn.</p>
      <p>It no longer counts toward the total. If this was a mistake, you can sign again from the <a href="/sign">signing page</a>.</p>`;
  } else if (sig.status === 'withdrawn') {
    content = html`<p>This ${what} was already withdrawn${sig.status_changed_at ? html` on ${formatLongDate(sig.status_changed_at)}` : ''}.</p>`;
  } else if (sig.status === 'rejected') {
    content = html`<p>This ${what} is not active. If you have questions, contact the organizer: ${contactLinks(settings)}.</p>`;
  } else {
    content = html`${summary(sig)}
      <p>If you withdraw, your household’s ${what} will stop counting right away. Someone in your household can sign again later.</p>
      <form method="post" action="/withdraw">
        <input type="hidden" name="token" value="${token}">
        <button type="submit" class="button button-danger">Withdraw my ${what}</button>
      </form>`;
  }
  return publicLayout({
    title: `Withdraw your ${what}`,
    settings,
    body: html`<div class="wrap narrow page-pad"><div class="sheet"><h1>Withdraw your ${what}</h1>${content}</div></div>`,
  });
}

export function unsubscribePage(settings: Settings, sid: string, sig: string, state: 'ask' | 'done'): Html {
  return simplePage(
    settings,
    'Email updates',
    state === 'done'
      ? html`<p>You will not get any more update emails from this site. Your signature or pledge is not affected.</p>`
      : html`<p>Stop update emails about the county petition? Your signature or pledge is not affected.</p>
          <form method="post" action="/unsubscribe"><input type="hidden" name="sid" value="${sid}"><input type="hidden" name="sig" value="${sig}">
          <button type="submit" class="button">Stop update emails</button></form>`,
  );
}

export function privacyPage(settings: Settings): Html {
  const s = settings;
  const co = s.co_organizers.trim();
  const body = html`<div class="wrap narrow page-pad"><div class="sheet prose">
  <h1>Privacy notice</h1>
  <p class="muted">Last updated ${formatLongDate(`${s.privacy_updated}T17:00:00.000Z`)}</p>

  <h2>Who runs this site</h2>
  <p>${s.organizer_name}, a Victory Lakes resident. This site is <strong>not</strong> run by the HOA,
  Prince William County or VDOT. Contact: ${contactLinks(s)}.</p>

  <h2>What we collect</h2>
  <p>When you sign, we record:</p>
  <ul>
    <li>your address (chosen from our list of homes), full name and email address</li>
    <li>your phone number, if you give it</li>
    <li>whether you own, rent or are another adult resident</li>
    <li>that you confirmed you are 18 or older and live at the address</li>
    <li>your typed signature, and the exact version of the text you signed</li>
    <li>whether you asked for updates</li>
    <li>the date and time you signed</li>
    <li>the internet (IP) address your submission came from, your browser’s user agent (browser and device type),
      and the approximate country and network, as reported by Cloudflare</li>
  </ul>

  <h2>Why we collect your IP address</h2>
  <p>To detect duplicate, automated or fake submissions, and to keep an audit record of when and from where each
  signature was submitted.</p>

  <h2>Who can see it</h2>
  <p>Only the organizer${co ? html` and co-organizers (${co})` : ''}. Your name is never shown on this site.</p>
  <p>If the petition is submitted, Prince William County DOT, and through it VDOT and the Board of County Supervisors,
  receive names, addresses, dates and signatures. Petition records given to a government body may become public records.
  IP addresses and email addresses are <strong>not</strong> included in that submission unless the county asks for them
  to verify the petition.</p>

  <h2>Service providers</h2>
  <p>Cloudflare hosts the site and database and runs the anti-spam check (Turnstile). If confirmation emails are turned on,
  an email delivery service sends them. We use no analytics or advertising trackers.</p>

  <h2>How long we keep it</h2>
  <ul>
    <li>IP addresses and browser details are deleted after ${s.retention_days_ip} days (the county petition is valid for 12 months).</li>
    <li>All signature data is deleted after ${s.retention_days_all} days, or 90 days after the county’s final decision, whichever comes first.</li>
    <li>If you withdraw, your name, email, phone and signature are cleared after 30 days. We keep only the address, dates and the fact that it was withdrawn, for the audit trail.</li>
  </ul>

  <h2>Your choices</h2>
  <p>You can withdraw at any time using the link in your confirmation email, or by contacting the organizer.
  You can also ask for a copy of your data or ask us to correct it.</p>

  <h2>Cookies</h2>
  <p>We do not use tracking cookies. The Turnstile anti-spam check may set a cookie it needs to work.
  The organizer’s admin pages use Cloudflare Access sign-in cookies.</p>
</div></div>`;
  return publicLayout({ title: 'Privacy notice', settings, body, active: 'privacy' });
}

export function faqPage(settings: Settings): Html {
  const s = settings;
  const qa = (q: string, a: Html) => html`<div class="faq-item"><h2>${q}</h2>${a}</div>`;
  const body = html`<div class="wrap narrow page-pad"><div class="sheet prose">
  <h1>Questions and answers</h1>
  ${qa(
    'Who runs this site?',
    html`<p>${s.organizer_name}, a Victory Lakes neighbor. Contact: ${contactLinks(s)}.</p>`,
  )}
  ${qa(
    'Is this an official county or HOA site?',
    html`<p>No. This is a resident-run site. Prince William County, VDOT and the HOA do not run it.
      The county’s own process decides whether speed tables are installed.</p>`,
  )}
  ${qa(
    'What is the difference between a pledge and the petition?',
    html`<p>A <strong>pledge</strong> shows support before the county issues its petition. It does not count toward the county’s
      ${s.goal_percent}% requirement. The <strong>petition</strong> uses the county’s own wording. When it is ready we will ask
      households that pledged to sign it too.</p>`,
  )}
  ${qa(
    'Why do you record my IP address?',
    html`<p>To spot duplicate, automated or fake submissions, and to keep a record of when and from where each signature came.
      IP addresses are deleted after ${s.retention_days_ip} days and are not sent to the county unless it asks for them to verify the petition.
      See the <a href="/privacy">privacy notice</a>.</p>`,
  )}
  ${qa(
    'I rent my home. Can I sign?',
    html`<p>Yes. The county allows one signature per household, and that person can be a renter.</p>`,
  )}
  ${qa(
    'Someone in my house already signed. What now?',
    html`<p>You are all set. The county counts one signature per household, so your household is already counted.
      If you think someone signed for your address by mistake, contact the organizer.</p>`,
  )}
  ${qa(
    'My address is not in the list.',
    html`<p>The county decides which homes are in the petition area: the street being studied and the streets that connect to it.
      If you think your home should be included, contact the organizer.</p>`,
  )}
  ${qa(
    'Can I sign on paper instead?',
    html`<p>Yes. Contact the organizer and we will bring you a paper form: ${contactLinks(s)}.</p>`,
  )}
  ${qa(
    'Could the HOA board replace the petition?',
    html`<p>In some cases the county can accept an HOA board resolution instead of a petition. Even then, pledges
      show the board and the county how much support there is.</p>`,
  )}
  ${qa(
    'How do I withdraw?',
    html`<p>Use the withdraw link in your confirmation email, or contact the organizer.</p>`,
  )}
</div></div>`;
  return publicLayout({ title: 'Questions and answers', settings, body, active: 'faq' });
}

export function errorPage(settings: Settings, status: number, title: string, message: string): Html {
  return simplePage(settings, title, html`<p>${message}</p><p><a href="/">Go to the home page</a></p>`);
}
