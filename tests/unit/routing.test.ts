import { describe, expect, it } from 'vitest';
import { localeFromParam, localizePath, splitLocale, switchLocale } from '../../src/i18n/routing';

describe('localizePath', () => {
  it('leaves the default locale unprefixed and always ends with a slash', () => {
    expect(localizePath('/', 'en')).toBe('/');
    expect(localizePath('work', 'en')).toBe('/work/');
    expect(localizePath('/work/echo/', 'en')).toBe('/work/echo/');
  });

  it('prefixes other locales', () => {
    expect(localizePath('/', 'de')).toBe('/de/');
    expect(localizePath('/work/echo', 'de')).toBe('/de/work/echo/');
  });
});

describe('splitLocale / switchLocale', () => {
  it('detects the locale from the first segment', () => {
    expect(splitLocale('/de/work/echo/')).toEqual({ locale: 'de', path: '/work/echo/' });
    expect(splitLocale('/de/')).toEqual({ locale: 'de', path: '/' });
    expect(splitLocale('/work/')).toEqual({ locale: 'en', path: '/work/' });
  });

  it('does not mistake a page that starts with a locale-like word for a locale', () => {
    expect(splitLocale('/design/')).toEqual({ locale: 'en', path: '/design/' });
  });

  it('maps a page to its counterpart in another locale', () => {
    expect(switchLocale('/work/echo/', 'de')).toBe('/de/work/echo/');
    expect(switchLocale('/de/about/', 'en')).toBe('/about/');
    expect(switchLocale('/', 'de')).toBe('/de/');
  });
});

describe('localeFromParam', () => {
  it('maps the route param to a locale and rejects unknown or redundant ones', () => {
    expect(localeFromParam(undefined)).toBe('en');
    expect(localeFromParam('de')).toBe('de');
    expect(() => localeFromParam('en')).toThrow();
    expect(() => localeFromParam('fr')).toThrow();
  });
});
