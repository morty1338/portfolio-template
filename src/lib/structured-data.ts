/**
 * JSON-LD builders (schema.org). Pure functions: the page passes in plain values.
 */
export interface PersonInput {
  name: string;
  url: string;
  jobTitle: string;
  description: string;
  image?: string;
  /** Omitted while it is a placeholder. */
  email?: string;
  city: string;
  country: string;
  knowsAbout: string[];
  sameAs: string[];
}

export function personJsonLd(p: PersonInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
    url: p.url,
    jobTitle: p.jobTitle,
    description: p.description,
    ...(p.image && { image: p.image }),
    ...(p.email && { email: `mailto:${p.email}` }),
    address: { '@type': 'PostalAddress', addressLocality: p.city, addressCountry: p.country },
    ...(p.knowsAbout.length > 0 && { knowsAbout: p.knowsAbout }),
    ...(p.sameAs.length > 0 && { sameAs: p.sameAs }),
  };
}

/**
 * Serializes JSON-LD for an inline <script type="application/ld+json">.
 * "<" is escaped so a value containing "</script>" can't end the script element early.
 */
export const serializeJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
