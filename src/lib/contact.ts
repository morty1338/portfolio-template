/**
 * Contact form rules, shared by the browser (inline errors) and the server endpoint (Phase 2),
 * so both always agree on what a valid inquiry is. No DOM, no network: unit-testable in Node.
 */
export const CONTACT_LIMITS = { name: 100, email: 254, company: 100, message: 5000 } as const;

export type ContactField = 'name' | 'email' | 'company' | 'message';
export type ContactError = 'required' | 'invalid' | 'tooLong';

export interface ContactPayload {
  name: string;
  email: string;
  company: string;
  message: string;
  /** Slug of the project the visitor came from (?from=), or '' */
  source: string;
  locale: string;
}

export type ContactResult =
  | { ok: true; data: ContactPayload }
  | { ok: false; spam: true }
  | { ok: false; spam: false; errors: Partial<Record<ContactField, ContactError>> };

/** Name of the hidden honeypot field: humans leave it empty, naive bots fill it. */
export const HONEYPOT_FIELD = 'website';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SLUG = /^[a-z0-9-]{1,80}$/;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function validateContact(
  input: Record<string, unknown>,
  locales: readonly string[],
  defaultLocale: string,
): ContactResult {
  if (text(input[HONEYPOT_FIELD]) !== '') return { ok: false, spam: true };

  const data: ContactPayload = {
    name: text(input.name),
    email: text(input.email),
    company: text(input.company),
    message: text(input.message),
    source: SLUG.test(text(input.source)) ? text(input.source) : '',
    locale: locales.includes(text(input.locale)) ? text(input.locale) : defaultLocale,
  };

  const errors: Partial<Record<ContactField, ContactError>> = {};
  if (!data.name) errors.name = 'required';
  if (!data.email) errors.email = 'required';
  else if (!EMAIL.test(data.email)) errors.email = 'invalid';
  if (!data.message) errors.message = 'required';
  for (const field of Object.keys(CONTACT_LIMITS) as ContactField[]) {
    if (!errors[field] && data[field].length > CONTACT_LIMITS[field]) errors[field] = 'tooLong';
  }

  return Object.keys(errors).length ? { ok: false, spam: false, errors } : { ok: true, data };
}
