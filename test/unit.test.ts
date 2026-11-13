import { describe, expect, it } from 'vitest';
import { householdLabel, normalizeHousehold, normalizeText } from '../src/lib/address';
import { checkFormToken, FORM_MAX_MS, issueFormToken, randomToken, timingSafeEqual } from '../src/lib/crypto';
import { csvCell, neutralizeFormula, parseCsv, toCsv, UTF8_BOM } from '../src/lib/csv';
import { escapeHtml, renderMarkdown } from '../src/lib/markdown';
import { formatLocalDateTime, localDateToIso } from '../src/lib/time';
import {
  isValidEmail,
  namesMatch,
  normalizeName,
  normalizePhone,
  validateNameField,
  validateSignForm,
} from '../src/lib/validate';
import { parseImportCsv } from '../src/lib/households';
import { parseSettings } from '../src/lib/settings';

describe('validate', () => {
  const good = {
    household_id: 'h1',
    full_name: '  Mary   O’Brien-Smith ',
    email: ' Mary@Example.COM ',
    phone: '+1 (703) 555-0123',
    relationship: 'renter',
    attest_adult: '1',
    attest_resident: 'on',
    typed_signature: "mary o'brien-smith",
    updates_opt_in: '1',
  };

  it('accepts a valid submission and normalises fields', () => {
    const { values, errors } = validateSignForm(good);
    expect(errors).toEqual({});
    expect(values.full_name).toBe("Mary O'Brien-Smith");
    expect(values.email).toBe('mary@example.com');
    expect(values.phone).toBe('7035550123');
    expect(values.relationship).toBe('renter');
    expect(values.updates_opt_in).toBe(true);
  });

  it('reports every missing required field', () => {
    const { errors } = validateSignForm({});
    expect(Object.keys(errors).sort()).toEqual(
      ['attest_adult', 'attest_resident', 'email', 'full_name', 'household_id', 'relationship', 'typed_signature'].sort(),
    );
  });

  it('requires the typed signature to match the name (case/space insensitive)', () => {
    expect(validateSignForm({ ...good, typed_signature: 'MARY   O’BRIEN-SMITH' }).errors.typed_signature).toBeUndefined();
    expect(validateSignForm({ ...good, typed_signature: 'Someone Else' }).errors.typed_signature).toMatch(/must match/);
  });

  it('validates name characters and length', () => {
    expect(validateNameField('J').error).toBeDefined();
    expect(validateNameField('x'.repeat(101)).error).toBeDefined();
    expect(validateNameField('Bob <script>').error).toMatch(/letters/);
    expect(validateNameField('José Núñez').error).toBeUndefined();
    expect(validateNameField('Dr. J. R. Smith Jr.').error).toBeUndefined();
    expect(validateNameField('-Bob').error).toBeDefined();
  });

  it('strips control and zero-width characters', () => {
    const { values } = validateSignForm({ ...good, full_name: 'Ma​ry\u0007 Smith', typed_signature: 'Mary Smith' });
    expect(values.full_name).toBe('Mary Smith');
  });

  it('validates email and phone', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@b.com`)).toBe(false);
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('703-555-0123')).toBe('7035550123');
    expect(normalizePhone('1 703 555 0123')).toBe('7035550123');
    expect(normalizePhone('555-0123')).toBeNull();
    expect(validateSignForm({ ...good, phone: '12345' }).errors.phone).toBeDefined();
    expect(validateSignForm({ ...good, email: 'nope' }).errors.email).toBeDefined();
  });

  it('rejects unknown relationships and unchecked attestations', () => {
    const { errors } = validateSignForm({ ...good, relationship: 'landlord', attest_adult: '', attest_resident: 'off' });
    expect(errors.relationship).toBeDefined();
    expect(errors.attest_adult).toBeDefined();
    expect(errors.attest_resident).toBeDefined();
  });

  it('normalises smart apostrophes', () => {
    expect(normalizeName('O’Neil')).toBe("O'Neil");
    expect(namesMatch('o’neil  pat', "O'Neil Pat")).toBe(true);
  });
});

describe('address normalisation', () => {
  it('lowercases, strips punctuation and expands abbreviations', () => {
    expect(normalizeText('12345 Victory Lakes Lp.')).toBe('12345 victory lakes loop');
    expect(normalizeText('12345  VICTORY LAKES LOOP')).toBe('12345 victory lakes loop');
    expect(normalizeText('9 Oak Ln')).toBe('9 oak lane');
    expect(normalizeText('9 Oak Dr')).toBe('9 oak drive');
    expect(normalizeText('9 Oak Ct')).toBe('9 oak court');
    expect(normalizeText('9 Oak Rd')).toBe('9 oak road');
    expect(normalizeText('9 Oak St')).toBe('9 oak street');
    expect(normalizeText('9 St Andrews Ct')).toBe('9 st andrews court');
  });

  it('normalises units and builds labels', () => {
    expect(normalizeHousehold('12', 'Victory Lakes Lp', 'Apt 3')).toBe('12 victory lakes loop unit 3');
    expect(normalizeHousehold('12', 'Victory Lakes Loop', '#3')).toBe('12 victory lakes loop unit 3');
    expect(householdLabel('12', 'Victory Lakes Loop', null)).toBe('12 Victory Lakes Loop');
    expect(householdLabel('12', 'Victory Lakes Loop', '3')).toBe('12 Victory Lakes Loop, Unit 3');
    expect(householdLabel('12', 'Victory Lakes Loop', 'Apt 3')).toBe('12 Victory Lakes Loop, Apt 3');
  });

  it('never lets LIKE wildcards through', () => {
    expect(normalizeText('12%_3')).toBe('12 3');
  });
});

describe('csv', () => {
  it('neutralises formula injection', () => {
    for (const s of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx']) expect(neutralizeFormula(s).startsWith("'")).toBe(true);
    expect(neutralizeFormula('Jane')).toBe('Jane');
  });

  it('quotes cells with commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(null)).toBe('');
    expect(csvCell('=1,2')).toBe(`"'=1,2"`);
  });

  it('writes a BOM and CRLF rows', () => {
    const out = toCsv(['a', 'b'], [[1, 'x']]);
    expect(out.startsWith(UTF8_BOM)).toBe(true);
    expect(out).toBe(`${UTF8_BOM}a,b\r\n1,x\r\n`);
  });

  it('parses quoted CSV and round-trips', () => {
    const rows = parseCsv(`${UTF8_BOM}a,b,c\r\n"1, one","say ""hi""",\n\n2,"multi\nline",x`);
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1, one', 'say "hi"', ''],
      ['2', 'multi\nline', 'x'],
    ]);
  });
});

describe('household CSV import parsing', () => {
  it('parses rows, flags and reports errors and duplicates', () => {
    const { rows, errors } = parseImportCsv(
      [
        'street_number,street_name,unit,zip,in_petition_area,occupied,notes',
        '100,Victory Lakes Loop,,20136,1,1,',
        '102,Victory Lakes Lp,,20136,yes,no,For sale',
        '100,victory lakes loop,,20136,,,dup',
        'abc,Victory Lakes Loop,,20136,1,1,',
        '104,Victory Lakes Loop,,2013,maybe,1,',
        '106,Victory Lakes Loop,,20136,,,',
      ].join('\n'),
    );
    expect(rows.map((r) => r.label)).toEqual(['100 Victory Lakes Loop', '102 Victory Lakes Lp', '106 Victory Lakes Loop']);
    expect(rows[1]).toMatchObject({ in_petition_area: 1, occupied: 0, notes: 'For sale' });
    expect(rows[2]).toMatchObject({ in_petition_area: null, occupied: null });
    expect(errors.map((e) => e.line)).toEqual([4, 5, 6]);
  });

  it('requires the key columns', () => {
    const { rows, errors } = parseImportCsv('number,street\n1,Main');
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toMatch(/street_number/);
  });
});

describe('markdown', () => {
  it('escapes raw HTML', () => {
    const out = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/<script|<img/);
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders the allow-listed constructs', () => {
    const out = renderMarkdown('# Title\n\nSome **bold** and *it*.\n\n- one\n- two\n\n1. first\n\n> quote');
    expect(out).toContain('<h3>Title</h3>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>it</em>');
    expect(out).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(out).toContain('<ol><li>first</li></ol>');
    expect(out).toContain('<blockquote>');
  });

  it('only links https and mailto, and cannot break out of attributes', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a');
    expect(renderMarkdown('[x](https://ok.example/a)')).toContain('<a href="https://ok.example/a"');
    const sneaky = renderMarkdown('[x](https://a.example/"onmouseover="alert(1))');
    expect(sneaky).not.toMatch(/"onmouseover=/);
  });

  it('escapeHtml covers quotes', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });
});

describe('crypto form tokens', () => {
  const secret = 'unit-test-secret';
  it('accepts a token older than 3 s', async () => {
    const t = await issueFormToken(secret, Date.now() - 5000);
    expect(await checkFormToken(secret, t)).toMatchObject({ ok: true });
  });
  it('rejects a token that is too fast', async () => {
    const t = await issueFormToken(secret, Date.now() - 1000);
    expect(await checkFormToken(secret, t)).toEqual({ ok: false, reason: 'too_fast' });
  });
  it('rejects an expired token', async () => {
    const t = await issueFormToken(secret, Date.now() - FORM_MAX_MS - 1000);
    expect(await checkFormToken(secret, t)).toEqual({ ok: false, reason: 'expired' });
  });
  it('rejects tampered or foreign tokens', async () => {
    const t = await issueFormToken(secret, Date.now() - 5000);
    const [p, ts, sig] = t.split('.');
    expect(await checkFormToken(secret, `${p}.${Number(ts) - 1000}.${sig}`)).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkFormToken('other-secret', t)).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkFormToken(secret, undefined)).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkFormToken(secret, 'garbage')).toEqual({ ok: false, reason: 'invalid' });
  });
  it('random tokens are 43-char base64url', () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(timingSafeEqual(t, t)).toBe(true);
    expect(timingSafeEqual(t, randomToken())).toBe(false);
  });
});

describe('time and settings', () => {
  it('formats in America/New_York', () => {
    expect(formatLocalDateTime('2026-11-13T20:04:05.000Z')).toBe('2026-11-13 15:04:05 EST');
    expect(formatLocalDateTime('2026-07-04T16:00:00.000Z')).toBe('2026-07-04 12:00:00 EDT');
  });
  it('maps local dates to a stable instant', () => {
    expect(localDateToIso('2026-02-30')).toBeNull();
    expect(localDateToIso('2026-11-13')).toBe('2026-11-13T17:00:00.000Z');
  });
  it('parses settings with defaults', () => {
    const s = parseSettings([
      { key: 'site_mode', value: 'bogus' },
      { key: 'occupied_override', value: '' },
      { key: 'goal_percent', value: '80' },
    ]);
    expect(s.site_mode).toBe('pledge');
    expect(s.occupied_override).toBeNull();
    expect(s.goal_percent).toBe(80);
    expect(parseSettings([{ key: 'occupied_override', value: '120' }]).occupied_override).toBe(120);
  });
});
