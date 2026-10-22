/**
 * Supported languages. A pure module (no file access), so the contact function on Vercel can use it too.
 * The first entry is the default locale (served without a URL prefix). Add a locale here + translations to support it.
 */
export const LOCALES = ['en', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export const defaultLocale: Locale = LOCALES[0];
