import { describe, expect, it } from 'vitest';
import { CONTACT_LIMITS, validateContact } from '../../src/lib/contact';

const LOCALES = ['en', 'de'];
const valid = { name: 'Anna Schmidt', email: 'anna@studio.de', company: 'Studio X', message: 'Hello!' };
const check = (input: Record<string, unknown>) => validateContact(input, LOCALES, 'en');

describe('validateContact', () => {
  it('accepts a complete inquiry and trims the values', () => {
    expect(check({ ...valid, name: '  Anna Schmidt ', source: 'demo-film', locale: 'de' })).toEqual({
      ok: true,
      data: { ...valid, source: 'demo-film', locale: 'de' },
    });
  });

  it('flags a filled honeypot as spam without listing field errors', () => {
    expect(check({ ...valid, website: 'http://spam.example' })).toEqual({ ok: false, spam: true });
  });

  it('reports every missing required field', () => {
    expect(check({ name: ' ', email: '', message: '' })).toEqual({
      ok: false,
      spam: false,
      errors: { name: 'required', email: 'required', message: 'required' },
    });
  });

  it('accepts a missing company (optional)', () => {
    expect(check({ ...valid, company: undefined }).ok).toBe(true);
  });

  it.each(['anna', 'anna@', 'anna@studio', 'anna @studio.de', 'anna@studio.d'])('rejects the e-mail %s', (email) => {
    expect(check({ ...valid, email })).toMatchObject({ ok: false, errors: { email: 'invalid' } });
  });

  it('enforces length limits', () => {
    const long = 'x'.repeat(CONTACT_LIMITS.message + 1);
    expect(check({ ...valid, message: long })).toMatchObject({ ok: false, errors: { message: 'tooLong' } });
  });

  it('drops a source that is not a slug and falls back to the default locale', () => {
    expect(check({ ...valid, source: '<script>', locale: 'fr' })).toMatchObject({
      ok: true,
      data: { source: '', locale: 'en' },
    });
  });

  it('treats non-string values as empty instead of crashing', () => {
    expect(check({ name: 42, email: ['a@b.de'], message: { text: 'hi' } })).toMatchObject({
      ok: false,
      errors: { name: 'required', email: 'required', message: 'required' },
    });
  });
});
