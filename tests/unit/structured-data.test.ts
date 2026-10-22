import { describe, expect, it } from 'vitest';
import { personJsonLd, serializeJsonLd } from '../../src/lib/structured-data';

const base = {
  name: 'Alex Example',
  url: 'https://example.org/',
  jobTitle: 'Director and content creator',
  description: 'Director based in Berlin.',
  city: 'Berlin',
  country: 'DE',
  knowsAbout: ['Premiere Pro'],
  sameAs: [],
};

describe('personJsonLd', () => {
  it('builds a schema.org Person with address and skills', () => {
    expect(personJsonLd({ ...base, image: 'https://example.org/p.jpg' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Alex Example',
      url: 'https://example.org/',
      jobTitle: 'Director and content creator',
      description: 'Director based in Berlin.',
      image: 'https://example.org/p.jpg',
      address: { '@type': 'PostalAddress', addressLocality: 'Berlin', addressCountry: 'DE' },
      knowsAbout: ['Premiere Pro'],
    });
  });

  it('leaves out optional fields that are empty', () => {
    const ld = personJsonLd({ ...base, knowsAbout: [] });
    expect(ld).not.toHaveProperty('email');
    expect(ld).not.toHaveProperty('sameAs');
    expect(ld).not.toHaveProperty('knowsAbout');
  });

  it('adds e-mail and profiles when given', () => {
    expect(personJsonLd({ ...base, email: 'hi@example.org', sameAs: ['https://vimeo.com/x'] })).toMatchObject({
      email: 'mailto:hi@example.org',
      sameAs: ['https://vimeo.com/x'],
    });
  });
});

describe('serializeJsonLd', () => {
  it('cannot break out of the script element', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});
