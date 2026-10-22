/**
 * URL helpers for locale-prefixed routes. The default locale has no prefix:
 *   en: /work/echo/    de: /de/work/echo/
 * Every page lives under src/pages/[...lang]/, and `localeStaticPaths()` generates one
 * route per locale, so adding a locale in site.ts adds all its pages.
 */
import { defaultLocale, site, type Locale } from '../config/site';

export const locales: readonly Locale[] = site.locales;

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value);

/** Route param for `[...lang]`: undefined for the default locale (= no prefix). */
export const langParam = (locale: Locale) => (locale === defaultLocale ? undefined : locale);

export const localeStaticPaths = () =>
  locales.map((locale) => ({ params: { lang: langParam(locale) }, props: { locale } }));

/** Locale from the `[...lang]` param; throws on unknown values so typos fail the build. */
export function localeFromParam(lang: string | undefined): Locale {
  if (lang === undefined) return defaultLocale;
  if (!isLocale(lang) || lang === defaultLocale) throw new Error(`Unknown locale segment: ${lang}`);
  return lang;
}

/** '/work/' + 'de' → '/de/work/'. Input is a locale-free path; output always ends with '/'. */
export function localizePath(path: string, locale: Locale): string {
  const clean = `/${path.replace(/^\/+|\/+$/g, '')}`;
  const withSlash = clean === '/' ? '/' : `${clean}/`;
  return locale === defaultLocale ? withSlash : `/${locale}${withSlash === '/' ? '/' : withSlash}`;
}

/** '/de/work/x/' → { locale: 'de', path: '/work/x/' } */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [first, ...rest] = pathname.split('/').filter(Boolean);
  if (isLocale(first) && first !== defaultLocale) {
    return { locale: first, path: rest.length ? `/${rest.join('/')}/` : '/' };
  }
  return { locale: defaultLocale, path: pathname.endsWith('/') ? pathname : `${pathname}/` };
}

/** The same page in another locale (used by the language switch and hreflang links). */
export const switchLocale = (pathname: string, target: Locale) => localizePath(splitLocale(pathname).path, target);
