import { html, raw } from 'hono/html';
import type { StreetGroup } from '../../lib/address';
import type { PetitionVersion } from '../../lib/petition';
import type { Settings } from '../../lib/settings';
import {
  RELATIONSHIPS,
  SIGN_FIELD_ORDER,
  type FieldErrors,
  type SignField,
  type SignFormValues,
} from '../../lib/validate';
import { petitionStatement } from '../components';
import { arrowRight } from '../icons';
import { contactLinks, publicLayout, type Html } from '../layout';

export interface SignFormProps {
  settings: Settings;
  version: PetitionVersion;
  groups: StreetGroup[];
  values: SignFormValues;
  errors: FieldErrors;
  /** Form-level problem shown at the top (Turnstile failure, duplicate household, …). */
  notice?: string | null;
  formToken: string;
  turnstileSiteKey: string;
  src: string | null;
}

const FIELD_ANCHORS: Record<SignField, string> = {
  household_id: 'household_id',
  full_name: 'full_name',
  email: 'email',
  phone: 'phone',
  relationship: 'relationship_owner',
  attest_adult: 'attest_adult',
  attest_resident: 'attest_resident',
  typed_signature: 'typed_signature',
  updates_opt_in: 'updates_opt_in',
};

function describedBy(field: SignField, errors: FieldErrors, hint = false): Html {
  const ids = [hint ? `${field}-hint` : '', errors[field] ? `${field}-error` : ''].filter(Boolean).join(' ');
  return ids ? html` aria-describedby="${ids}"` : html``;
}

function invalid(field: SignField, errors: FieldErrors): Html {
  return errors[field] ? raw(' aria-invalid="true"') : raw('');
}

function fieldError(field: SignField, errors: FieldErrors): Html {
  const msg = errors[field];
  return msg ? html`<p class="field-error" id="${field}-error"><span class="visually-hidden">Error:</span> ${msg}</p>` : html``;
}

function errorSummary(errors: FieldErrors, notice: string | null | undefined): Html {
  const items = SIGN_FIELD_ORDER.filter((f) => errors[f]);
  if (!items.length && !notice) return html``;
  return html`<div class="error-summary" id="error-summary" role="alert" tabindex="-1" autofocus>
    <h2>${items.length ? 'Please fix the following' : 'There is a problem'}</h2>
    ${notice ? html`<p>${notice}</p>` : ''}
    ${items.length
      ? html`<ul>${items.map((f) => html`<li><a href="#${FIELD_ANCHORS[f]}">${errors[f]}</a></li>`)}</ul>`
      : ''}
  </div>`;
}

function addressField(groups: StreetGroup[], values: SignFormValues, errors: FieldErrors): Html {
  return html`<div class="field${errors.household_id ? ' has-error' : ''}" id="address-field">
    <label for="household_id">Your address</label>
    <p class="hint" id="household_id-hint"><span class="js-only">Start typing your house number, then pick your address from the list.</span><span class="no-js-only">Find your street, then your house number.</span></p>
    ${fieldError('household_id', errors)}
    <select id="household_id" name="household_id" required data-combobox="/api/address-search"${describedBy('household_id', errors, true)}${invalid('household_id', errors)}>
      <option value="">Choose your address</option>
      ${groups.map(
        (g) => html`<optgroup label="${g.street}">
          ${g.households.map(
            (h) => html`<option value="${h.id}"${h.id === values.household_id ? raw(' selected') : ''}>${h.label}</option>`,
          )}
        </optgroup>`,
      )}
    </select>
  </div>`;
}

function textField(opts: {
  field: SignField;
  label: string;
  value: string;
  errors: FieldErrors;
  type?: string;
  autocomplete?: string;
  inputmode?: string;
  hint?: string;
  required?: boolean;
  maxlength?: number;
}): Html {
  const { field, errors } = opts;
  return html`<div class="field${errors[field] ? ' has-error' : ''}">
    <label for="${field}">${opts.label}${opts.required === false ? html` <span class="optional">(optional)</span>` : ''}</label>
    ${opts.hint ? html`<p class="hint" id="${field}-hint">${opts.hint}</p>` : ''}
    ${fieldError(field, errors)}
    <input id="${field}" name="${field}" type="${opts.type ?? 'text'}" value="${opts.value}"
      ${opts.autocomplete ? html`autocomplete="${opts.autocomplete}"` : ''}
      ${opts.inputmode ? html`inputmode="${opts.inputmode}"` : ''}
      ${opts.maxlength ? html`maxlength="${opts.maxlength}"` : ''}
      ${opts.required === false ? '' : raw('required')}
      spellcheck="false"${describedBy(field, errors, !!opts.hint)}${invalid(field, errors)}>
  </div>`;
}

function checkbox(field: SignField, label: Html | string, checked: boolean, errors: FieldErrors, required = true): Html {
  return html`<div class="field check${errors[field] ? ' has-error' : ''}">
    ${fieldError(field, errors)}
    <input type="checkbox" id="${field}" name="${field}" value="1"${checked ? raw(' checked') : ''}${required ? raw(' required') : ''}${describedBy(field, errors)}${invalid(field, errors)}>
    <label for="${field}">${label}</label>
  </div>`;
}

export function privacyShortNotice(): Html {
  return html`<div class="notice privacy-notice" id="privacy-short">
    <p><strong>What we collect and why.</strong> When you sign, this site records your name, address, email,
    phone (if you give it), whether you own or rent, the date and time, and the internet (IP) address and browser type
    your submission came from. We use this only to run this petition, to prevent duplicate or fake signatures, and,
    if the county accepts it, to submit the petition to Prince William County. We never sell it or use it for anything
    else. Your name is never shown publicly. <a href="/privacy">Read the full privacy notice</a>.</p>
  </div>`;
}

export function signFormPage(p: SignFormProps): Html {
  const { settings: s, version: v, values, errors } = p;
  const isPledge = v.mode === 'pledge';
  const noun = isPledge ? 'pledge' : 'petition';

  const body = html`<div class="wrap narrow page-pad">
  <h1>${isPledge ? 'Sign the pledge' : 'Sign the petition'}</h1>
  <p class="lead">One adult signs for each household. It takes about two minutes.</p>
  ${errorSummary(errors, p.notice)}
  ${petitionStatement(v)}

  <form method="post" action="/sign" class="frame sign-form" novalidate>
    <input type="hidden" name="petition_version_id" value="${v.id}">
    <input type="hidden" name="form_started_at" value="${p.formToken}">
    ${p.src ? html`<input type="hidden" name="src" value="${p.src}">` : ''}

    ${p.groups.length
      ? addressField(p.groups, values, errors)
      : html`<p class="notice">The address list has not been loaded yet. Please check back soon, or contact the organizer.</p>`}

    ${textField({ field: 'full_name', label: 'Full name', value: values.full_name, errors, autocomplete: 'name', maxlength: 100 })}
    ${textField({
      field: 'email',
      label: 'Email',
      value: values.email,
      errors,
      type: 'email',
      autocomplete: 'email',
      inputmode: 'email',
      maxlength: 254,
      hint: 'We send one confirmation email with a link to withdraw. No newsletters.',
    })}
    ${textField({
      field: 'phone',
      label: 'Phone',
      value: values.phone,
      errors,
      type: 'tel',
      autocomplete: 'tel-national',
      inputmode: 'tel',
      required: false,
      maxlength: 20,
      hint: 'Only so the organizer can follow up if there is a question about your signature.',
    })}

    <fieldset class="field${errors.relationship ? ' has-error' : ''}"${describedBy('relationship', errors)}>
      <legend>Your relationship to this home</legend>
      ${fieldError('relationship', errors)}
      <div class="radios">
        ${RELATIONSHIPS.map(
          (r) => html`<div class="radio">
            <input type="radio" id="relationship_${r.value}" name="relationship" value="${r.value}"${values.relationship === r.value ? raw(' checked') : ''} required>
            <label for="relationship_${r.value}">${r.label}</label>
          </div>`,
        )}
      </div>
      <p class="hint">Renters can sign. The county counts one signature per household.</p>
    </fieldset>

    ${checkbox('attest_adult', 'I am 18 or older', values.attest_adult, errors)}
    ${checkbox('attest_resident', v.attestation_text, values.attest_resident, errors)}

    ${textField({
      field: 'typed_signature',
      label: 'Type your full name as your signature',
      value: values.typed_signature,
      errors,
      autocomplete: 'off',
      maxlength: 100,
      hint: 'It must match the full name above.',
    })}

    ${checkbox(
      'updates_opt_in',
      isPledge
        ? 'Keep me updated about the county petition (we will email you when it is ready)'
        : 'Keep me updated about the county petition',
      values.updates_opt_in,
      errors,
      false,
    )}

    <div class="hp" aria-hidden="true">
      <label for="website">Leave this field empty</label>
      <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
    </div>

    <div class="field turnstile-field">
      <div id="turnstile" class="turnstile" data-sitekey="${p.turnstileSiteKey}" data-action="sign"></div>
      <noscript><p class="notice">The anti-spam check needs JavaScript. If you can’t turn it on, contact the organizer and we’ll help you sign on paper.</p></noscript>
    </div>

    ${privacyShortNotice()}

    <button type="submit" class="button button-primary button-block">Sign the ${noun}${arrowRight}</button>

    <p class="small paper-fallback">Having trouble? Email or call the organizer and we’ll help you sign on paper: ${contactLinks(s)}.</p>
  </form>
</div>`;

  return publicLayout({
    title: isPledge ? 'Sign the pledge' : 'Sign the petition',
    settings: s,
    body,
    active: 'sign',
    scripts: ['/js/form.js', '/js/combobox.js', '/js/turnstile.js'],
  });
}

export function signUnavailablePage(settings: Settings, reason: 'closed' | 'no_version' | 'no_area'): Html {
  const msg =
    reason === 'closed'
      ? html`<p>Thank you. Signatures are closed.</p><p><a href="/">See the final count</a>.</p>`
      : reason === 'no_area'
        ? html`<p>Signing will open once Prince William County sets the petition area. Please check back soon.</p>`
        : html`<p>Signing is not open yet. Please check back soon.</p>`;
  return publicLayout({
    title: reason === 'closed' ? 'Signatures are closed' : 'Not open yet',
    settings,
    active: 'sign',
    body: html`<div class="wrap narrow page-pad"><div class="sheet"><h1>${reason === 'closed' ? 'Signatures are closed' : 'Signing is not open yet'}</h1>${msg}
      <p>Questions? Contact the organizer: ${contactLinks(settings)}.</p></div></div>`,
  });
}
