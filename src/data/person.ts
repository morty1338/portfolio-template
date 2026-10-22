/** schema.org Person for Home and About, built from the profile and site config. */
import { getImage } from 'astro:assets';
import { isPlaceholder, site, type Locale } from '../config/site';
import { localizePath } from '../i18n/routing';
import { personJsonLd } from '../lib/structured-data';
import { getProfile } from './content';

export async function getPersonJsonLd(locale: Locale) {
  const profile = await getProfile();
  const portrait = await getImage({ src: profile.portrait, width: 800, format: 'jpg' });
  return personJsonLd({
    name: site.name,
    url: new URL(localizePath('/', locale), site.url).href,
    jobTitle: profile.jobTitle[locale],
    description: profile.tagline[locale],
    image: new URL(portrait.src, site.url).href,
    email: isPlaceholder(site.email) ? undefined : site.email,
    city: site.city,
    country: site.country,
    knowsAbout: profile.skills.flatMap((group) => group.items.map((item) => item[locale])),
    sameAs: site.socials.map((s) => s.url),
  });
}
