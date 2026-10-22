/**
 * Site-wide settings. Instance data (name, URL, e-mail, …) comes from `<content root>/site.json`,
 * so the code is the same for every site built from this template (see content-root.ts).
 * Code-level settings (locales, endpoints) stay here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'astro/zod';
import { contentRoot } from './content-root';
import { LOCALES, defaultLocale, type Locale } from './locales';

const siteSchema = z.object({
  name: z.string().min(1),
  /** Production URL without trailing slash; used for canonical URLs, sitemap and Open Graph. */
  url: z.url().refine((u) => !u.endsWith('/'), 'url must not end with "/"'),
  /** Public contact e-mail. */
  email: z.email(),
  city: z.string().min(1),
  /** ISO 3166-1 alpha-2, e.g. "DE". */
  country: z.string().length(2),
  /** Public profiles (Instagram, Vimeo, LinkedIn, …), shown in the footer and in JSON-LD `sameAs`. */
  socials: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
  /** Path under /public to the CV, or null while there is none. */
  cvPath: z.string().startsWith('/').nullable().default(null),
});

const instance = siteSchema.parse(JSON.parse(readFileSync(path.join(contentRoot, 'site.json'), 'utf8')));

export const site = {
  ...instance,
  /** Endpoint the contact form posts to (implemented in Phase 2). */
  contactEndpoint: '/api/contact',
  locales: LOCALES,
};

export { defaultLocale, type Locale };

/** True while a value still holds its placeholder; used to hide it from structured data. */
export const isPlaceholder = (value: string) => value.includes('.example');
