import type { APIRoute } from 'astro';
import { isIndexable } from '../config/env';
import { site } from '../config/site';

/** Production allows everything and points to the sitemap; preview deployments block all crawlers. */
export const GET: APIRoute = () =>
  new Response(
    isIndexable
      ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site.url).href}\n`
      : 'User-agent: *\nDisallow: /\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
