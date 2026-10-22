import { describe, expect, it } from 'vitest';
import { defaultLocale, site } from '../../src/config/site';
import { uiKeys, useTranslations } from '../../src/i18n/ui';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('UI strings', () => {
  const source = useTranslations(defaultLocale);

  // The type system forces every locale to define every key; this checks what types can't.
  it.each(site.locales.filter((l) => l !== defaultLocale))('%s: no empty strings, same {placeholders}', (locale) => {
    const t = useTranslations(locale);
    for (const key of uiKeys) {
      expect(t(key).trim(), `${locale}: ${key} is empty`).not.toBe('');
      expect(placeholders(t(key)), `${locale}: ${key}`).toEqual(placeholders(source(key)));
    }
  });

  it('fills placeholders', () => {
    expect(useTranslations('en')('filter.count', { count: 3, total: 6 })).toBe('3 of 6 projects shown');
    expect(useTranslations('de')('filter.count', { count: 3, total: 6 })).toBe('3 von 6 Projekten angezeigt');
  });
});
