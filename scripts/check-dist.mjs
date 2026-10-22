#!/usr/bin/env node
/**
 * Post-build checks on dist/ (run after `astro build`; also in CI):
 * - every page: <html lang>, one <h1>, <title>, meta description, absolute canonical, alt on every <img>
 * - indexable pages: hreflang for every locale + x-default, Open Graph title/description/image,
 *   og:image is absolute, exists in dist/, is 1.91:1 and matches its declared width/height
 * - every JSON-LD block parses
 * - sitemap lists exactly the indexable pages; robots.txt points to it
 * - no unprocessed original images in dist/_astro (Astro only deletes originals it transformed)
 *
 * Usage: node scripts/check-dist.mjs [dist]
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dist = path.resolve(process.argv[2] ?? 'dist');
const LOCALES = ['en', 'de', 'x-default'];
const failures = [];
const fail = (page, message) => failures.push(`${page}: ${message}`);

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? htmlFiles(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : [],
    ),
  );
  return nested.flat();
}

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const metaContent = (html, key, value) =>
  html.match(new RegExp(`<meta[^>]*${key}="${value}"[^>]*>`))?.[0] &&
  attr(html.match(new RegExp(`<meta[^>]*${key}="${value}"[^>]*>`))[0], 'content');
const decode = (s) => s.replace(/&amp;/g, '&');

const files = await htmlFiles(dist);
const indexable = [];

for (const file of files) {
  const page = '/' + path.relative(dist, file).replace(/index\.html$/, '');
  const html = await readFile(file, 'utf8');

  if (!/<html[^>]*\slang="[a-z]{2}"/.test(html)) fail(page, 'missing <html lang>');
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) fail(page, `expected one <h1>, found ${h1}`);
  if (!/<title>[^<]+<\/title>/.test(html)) fail(page, 'missing <title>');
  if (!metaContent(html, 'name', 'description')) fail(page, 'missing meta description');
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0];
  if (!canonical || !/^https?:\/\//.test(attr(canonical, 'href') ?? '')) fail(page, 'missing absolute canonical');
  for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
    // `alt` without a value (how Astro writes alt="") is valid: it marks a decorative image.
    if (!/\salt(=|\s|\/?>)/.test(img)) fail(page, `<img> without alt: ${img.slice(0, 80)}`);
  }
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(json);
    } catch {
      fail(page, 'JSON-LD does not parse');
    }
  }

  const robots = metaContent(html, 'name', 'robots') ?? '';
  if (robots.includes('noindex')) continue;
  indexable.push(page);

  const hreflangs = [...html.matchAll(/<link[^>]*rel="alternate"[^>]*hreflang="([^"]+)"/g)].map((m) => m[1]);
  for (const l of LOCALES) if (!hreflangs.includes(l)) fail(page, `missing hreflang="${l}"`);
  for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) {
    if (!metaContent(html, 'property', key)) fail(page, `missing ${key}`);
  }
  const ogImage = metaContent(html, 'property', 'og:image');
  if (ogImage) {
    const url = new URL(decode(ogImage));
    const file = path.join(dist, decodeURIComponent(url.pathname));
    if (!existsSync(file)) fail(page, `og:image file not in dist: ${url.pathname}`);
    else {
      // The declared size must be the real one, and the crop must be 1.91:1 (link preview cards).
      const { width, height } = await sharp(file).metadata();
      const declared = `${metaContent(html, 'property', 'og:image:width')}x${metaContent(html, 'property', 'og:image:height')}`;
      if (declared !== `${width}x${height}`) fail(page, `og:image is ${width}x${height}, meta says ${declared}`);
      if (Math.abs(width / height - 1200 / 630) > 0.02)
        fail(page, `og:image ratio ${(width / height).toFixed(2)} ≠ 1.91`);
    }
  }
}

// Sitemap ↔ indexable pages
const sitemapFiles = (await readdir(dist)).filter((f) => /^sitemap-\d+\.xml$/.test(f));
const sitemapUrls = new Set();
for (const f of sitemapFiles) {
  for (const [, loc] of (await readFile(path.join(dist, f), 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)) {
    sitemapUrls.add(new URL(loc).pathname);
  }
}
const pagesInSitemap = indexable.filter((p) => p !== '/404.html');
for (const p of pagesInSitemap) if (!sitemapUrls.has(p)) fail('sitemap', `missing ${p}`);
for (const u of sitemapUrls) if (!pagesInSitemap.includes(u)) fail('sitemap', `lists a non-indexable page ${u}`);

const robotsTxt = existsSync(path.join(dist, 'robots.txt'))
  ? await readFile(path.join(dist, 'robots.txt'), 'utf8')
  : '';
if (!/Sitemap: https?:\/\/\S+\/sitemap-index\.xml/.test(robotsTxt)) fail('robots.txt', 'no Sitemap line');

// Originals: transformed files carry a "_<hash>" suffix before the extension.
const assets = existsSync(path.join(dist, '_astro')) ? await readdir(path.join(dist, '_astro')) : [];
for (const f of assets) {
  if (/\.(jpe?g|png|webp|avif|gif|tiff?)$/i.test(f) && !/_[A-Za-z0-9-]+\.[a-z]+$/.test(f)) {
    fail('dist/_astro', `unprocessed original image: ${f}`);
  }
}

console.log(
  `${files.length} pages checked, ${indexable.length} indexable, ${sitemapUrls.size} in sitemap, ${assets.length} assets`,
);
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log('✓ all dist checks passed');
