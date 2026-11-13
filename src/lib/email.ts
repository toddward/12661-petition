/** Transactional email via a provider HTTP API (spec §7). One email per signature. */
import { flag, type AppEnv, type Mode } from '../env';
import { escapeHtml } from './markdown';
import { formatLongDate } from './time';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export function emailEnabled(env: AppEnv): boolean {
  return flag(env.EMAIL_ENABLED) && !!env.EMAIL_API_KEY && !!env.EMAIL_FROM;
}

export async function sendEmail(env: AppEnv, msg: EmailMessage): Promise<{ ok: boolean; status?: number }> {
  if (!emailEnabled(env)) return { ok: false };
  const provider = (env.EMAIL_PROVIDER ?? 'resend').toLowerCase();
  let res: Response;
  try {
    if (provider === 'postmark') {
      res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Postmark-Server-Token': env.EMAIL_API_KEY!,
        },
        body: JSON.stringify({
          From: env.EMAIL_FROM,
          To: msg.to,
          Subject: msg.subject,
          TextBody: msg.text,
          HtmlBody: msg.html,
          MessageStream: 'outbound',
          Headers: Object.entries(msg.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
        }),
      });
    } else {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.EMAIL_API_KEY}` },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
          headers: msg.headers,
        }),
      });
    }
  } catch (err) {
    console.error('email send failed', String(err));
    return { ok: false };
  }
  if (!res.ok) console.error('email provider error', res.status);
  return { ok: res.ok, status: res.status };
}

function siteBase(env: AppEnv): string {
  return env.SITE_URL.replace(/\/+$/, '');
}

function wrapHtml(paragraphs: string[]): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1d2a2b;max-width:560px;margin:0 auto;padding:16px">${paragraphs.join('')}</body></html>`;
}

export function confirmationEmail(
  env: AppEnv,
  data: { to: string; name: string; address: string; signedAt: string; mode: Mode; token: string; organizerName: string },
): EmailMessage {
  const base = siteBase(env);
  const confirmUrl = `${base}/confirm?token=${encodeURIComponent(data.token)}`;
  const withdrawUrl = `${base}/withdraw?token=${encodeURIComponent(data.token)}`;
  const what = data.mode === 'pledge' ? 'pledge of support' : 'petition signature';
  const date = formatLongDate(data.signedAt);
  const pledgeNote =
    data.mode === 'pledge'
      ? 'This is a pledge of support, not the county’s petition. When Prince William County issues its petition, we will ask your household to sign that too.'
      : 'Your household’s signature has been recorded. The organizer will submit the petition to Prince William County DOT once enough households have signed.';

  const text = [
    `Hi ${data.name},`,
    '',
    `Thanks for your ${what} for speed tables on Victory Lakes Loop.`,
    '',
    `Name: ${data.name}`,
    `Address: ${data.address}`,
    `Date: ${date}`,
    '',
    pledgeNote,
    '',
    `Please confirm your email address: ${confirmUrl}`,
    '',
    `Changed your mind? You can withdraw at any time: ${withdrawUrl}`,
    '',
    `If you did not sign, someone may have used your email address. Use the withdraw link above, or reply to this email.`,
    '',
    `${data.organizerName}, Victory Lakes resident`,
    `This is a resident-run effort. It is not run by the HOA, Prince William County or VDOT.`,
  ].join('\n');

  const e = escapeHtml;
  const html = wrapHtml([
    `<p>Hi ${e(data.name)},</p>`,
    `<p>Thanks for your ${e(what)} for speed tables on Victory Lakes Loop.</p>`,
    `<p><strong>Name:</strong> ${e(data.name)}<br><strong>Address:</strong> ${e(data.address)}<br><strong>Date:</strong> ${e(date)}</p>`,
    `<p>${e(pledgeNote)}</p>`,
    `<p><a href="${e(confirmUrl)}" style="display:inline-block;background:#0b5d57;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Confirm my email</a></p>`,
    `<p>Changed your mind? <a href="${e(withdrawUrl)}">Withdraw my ${e(what)}</a>.</p>`,
    `<p style="color:#4b5a5b;font-size:14px">If you did not sign, someone may have used your email address. Use the withdraw link above, or reply to this email.</p>`,
    `<p style="color:#4b5a5b;font-size:14px">${e(data.organizerName)}, Victory Lakes resident. This is a resident-run effort. It is not run by the HOA, Prince William County or VDOT.</p>`,
  ]);

  return { to: data.to, subject: `Thanks for your ${what}: speed tables on Victory Lakes Loop`, text, html };
}

export function followupEmail(
  env: AppEnv,
  data: { to: string; name: string; signatureId: string; unsubscribe: string; organizerName: string },
): EmailMessage {
  const base = siteBase(env);
  const signUrl = `${base}/sign?src=followup`;
  const unsubscribeUrl = `${base}/unsubscribe?sid=${encodeURIComponent(data.signatureId)}&sig=${encodeURIComponent(data.unsubscribe)}`;
  const text = [
    `Hi ${data.name},`,
    '',
    `You pledged your support for speed tables on Victory Lakes Loop. Thank you.`,
    '',
    `Prince William County has now issued its petition. Your pledge does not count as a signature, so please sign the petition here. It takes about two minutes:`,
    signUrl,
    '',
    `The county needs signatures from 75% of occupied households in the petition area. One signature per household.`,
    '',
    `${data.organizerName}, Victory Lakes resident`,
    '',
    `Don't want more updates? ${unsubscribeUrl}`,
  ].join('\n');
  const e = escapeHtml;
  const html = wrapHtml([
    `<p>Hi ${e(data.name)},</p>`,
    `<p>You pledged your support for speed tables on Victory Lakes Loop. Thank you.</p>`,
    `<p>Prince William County has now issued its petition. Your pledge does not count as a signature, so please sign the petition. It takes about two minutes.</p>`,
    `<p><a href="${e(signUrl)}" style="display:inline-block;background:#0b5d57;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Sign the petition</a></p>`,
    `<p>The county needs signatures from 75% of occupied households in the petition area. One signature per household.</p>`,
    `<p>${e(data.organizerName)}, Victory Lakes resident</p>`,
    `<p style="color:#4b5a5b;font-size:14px"><a href="${e(unsubscribeUrl)}">Stop these updates</a></p>`,
  ]);
  return {
    to: data.to,
    subject: 'The county petition is ready: please sign for Victory Lakes Loop',
    text,
    html,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
  };
}
