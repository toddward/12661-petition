/** Server-side validation for the signing form (spec §4.2, §6 step 7). */

export type Relationship = 'owner' | 'renter' | 'resident';
export const RELATIONSHIPS: { value: Relationship; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'renter', label: 'Renter' },
  { value: 'resident', label: 'Other adult resident' },
];

export interface SignFormValues {
  household_id: string;
  full_name: string;
  email: string;
  phone: string;
  relationship: string;
  attest_adult: boolean;
  attest_resident: boolean;
  typed_signature: string;
  updates_opt_in: boolean;
}

export type SignField = keyof SignFormValues;
export type FieldErrors = Partial<Record<SignField, string>>;

/** Field order, used for the error summary. */
export const SIGN_FIELD_ORDER: SignField[] = [
  'household_id',
  'full_name',
  'email',
  'phone',
  'relationship',
  'attest_adult',
  'attest_resident',
  'typed_signature',
];

// C0/C1 control characters plus zero-width and bidi-override characters.
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/g;

/** Trim, strip control characters and enforce a hard max length. */
export function cleanString(value: unknown, max = 1000): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

/** Phones often turn ' into ’ (smart punctuation). Normalise before validating or comparing. */
export function normalizeName(value: string): string {
  return value.replace(/[‘’ʼ`´]/g, "'").replace(/\s+/g, ' ').trim();
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a).toLocaleLowerCase('en-US') === normalizeName(b).toLocaleLowerCase('en-US');
}

const NAME_RE = /^\p{L}[\p{L}\p{M} '.\-]*$/u;
const EMAIL_RE = /^[^\s@"<>(),;:\\[\]]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** Returns 10 digits, '' for empty input, or null when invalid. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits === '') return '';
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return ten.length === 10 ? ten : null;
}

export function formatPhone(digits: string | null | undefined): string {
  if (!digits || digits.length !== 10) return digits ?? '';
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function checked(v: unknown): boolean {
  return v === 'on' || v === '1' || v === 'true' || v === 'yes';
}

export function validateNameField(raw: string): { value: string; error?: string } {
  const value = normalizeName(raw);
  if (!value) return { value, error: 'Enter your full name.' };
  if (value.length < 2 || value.length > 100)
    return { value, error: 'Your name must be between 2 and 100 characters.' };
  if (!NAME_RE.test(value))
    return { value, error: 'Use letters, spaces, apostrophes, hyphens and periods only.' };
  return { value };
}

export function validateSignForm(body: Record<string, unknown>): { values: SignFormValues; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const household_id = cleanString(body.household_id, 64);
  if (!household_id) errors.household_id = 'Choose your address from the list.';

  const name = validateNameField(cleanString(body.full_name, 200));
  if (name.error) errors.full_name = name.error;

  const email = normalizeEmail(cleanString(body.email, 300));
  if (!email) errors.email = 'Enter your email address.';
  else if (!isValidEmail(email)) errors.email = 'Enter an email address like name@example.com.';

  const phoneRaw = cleanString(body.phone, 40);
  const phone = normalizePhone(phoneRaw);
  if (phone === null) errors.phone = 'Enter a 10-digit US phone number, or leave this blank.';

  const relationship = cleanString(body.relationship, 20);
  if (!RELATIONSHIPS.some((r) => r.value === relationship))
    errors.relationship = 'Choose whether you own, rent, or are another adult resident.';

  const attest_adult = checked(body.attest_adult);
  if (!attest_adult) errors.attest_adult = 'Confirm that you are 18 or older.';

  const attest_resident = checked(body.attest_resident);
  if (!attest_resident) errors.attest_resident = 'Confirm that you live at this address and are signing for your household.';

  const typed_signature = normalizeName(cleanString(body.typed_signature, 200));
  if (!typed_signature) errors.typed_signature = 'Type your full name as your signature.';
  else if (!name.error && !namesMatch(typed_signature, name.value))
    errors.typed_signature = 'Your signature must match the full name you entered above.';

  return {
    values: {
      household_id,
      full_name: name.value,
      email,
      phone: phone ?? phoneRaw,
      relationship,
      attest_adult,
      attest_resident,
      typed_signature,
      updates_opt_in: checked(body.updates_opt_in),
    },
    errors,
  };
}

export function emptySignValues(): SignFormValues {
  return {
    household_id: '',
    full_name: '',
    email: '',
    phone: '',
    relationship: '',
    attest_adult: false,
    attest_resident: false,
    typed_signature: '',
    updates_opt_in: false,
  };
}

/** Lets only short, safe campaign source tags through (e.g. "mailer"). */
export function cleanSource(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9_-]{1,32}$/.test(s) ? s : null;
}
