import type { APIRoute } from 'astro';
import { site } from '../config/site';

/** Favicon with the site owner's initial, so it never needs to be redrawn per instance. Colours mirror --ink-1 / --bg. */
export const GET: APIRoute = () =>
  new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#1a1917"/>` +
      `<text x="16" y="23" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#f6f4ef">` +
      `${site.name.trim().charAt(0).toUpperCase().replace(/[<&>]/g, '')}</text></svg>`,
    { headers: { 'Content-Type': 'image/svg+xml' } },
  );
