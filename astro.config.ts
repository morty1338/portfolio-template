import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { defaultLocale, site } from './src/config/site';

export default defineConfig({
  site: site.url,
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    locales: [...site.locales],
    defaultLocale,
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      // Legal pages are noindex stubs until Phase 4; they don't belong in the sitemap.
      filter: (page) => !/\/(impressum|datenschutz)\/$/.test(page),
      i18n: {
        defaultLocale,
        locales: Object.fromEntries(site.locales.map((l) => [l, l])),
      },
    }),
  ],
  image: {
    // Visitors get AVIF/WebP in these widths; originals never reach dist/.
    breakpoints: [360, 640, 960, 1280, 1600, 2048],
  },
});
