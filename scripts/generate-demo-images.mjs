#!/usr/bin/env node
/**
 * Generates the demo images (abstract "film stills", photos, paintings and a portrait silhouette)
 * from a manifest, so the template ships no third-party photos and has no licence questions.
 * Deterministic: the same manifest always produces the same files.
 *
 * Usage: node scripts/generate-demo-images.mjs [content-demo/images.json]
 * Manifest: { "seed": 1, "images": [{ "path": "projects/x/thumbnail.jpg", "width": 1600, "height": 900,
 *             "kind": "horizon" | "figure" | "blocks" | "rings", "palette": ["#…", "#…", "#…"] }] }
 * Paths are relative to the manifest's folder.
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const manifestPath = path.resolve(process.argv[2] ?? 'content-demo/images.json');
const root = path.dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

/** mulberry32: tiny seeded PRNG, so every run draws the same shapes. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const kinds = {
  /** Sky gradient, a low sun, a sea with light stripes. */
  horizon(w, h, [a, b, c], rnd) {
    const horizon = h * (0.55 + rnd() * 0.15);
    const sunX = w * (0.2 + rnd() * 0.6);
    const stripes = Array.from({ length: 9 }, (_, i) => {
      const y = horizon + ((i + 1) * (h - horizon)) / 10;
      const len = w * (0.08 + rnd() * 0.2);
      return `<rect x="${sunX - len / 2}" y="${y}" width="${len}" height="${h / 160}" fill="${c}" opacity="${0.5 - i * 0.04}"/>`;
    }).join('');
    return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#sky)"/>
      <circle cx="${sunX}" cy="${horizon}" r="${h * (0.12 + rnd() * 0.08)}" fill="${c}"/>
      <rect y="${horizon}" width="${w}" height="${h - horizon}" fill="${a}" opacity="0.92"/>${stripes}`;
  },
  /** Head-and-shoulders silhouette against a soft gradient (the demo "portrait"). */
  figure(w, h, [a, b, c]) {
    const cx = w / 2;
    return `<defs><radialGradient id="bg" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></radialGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#bg)"/>
      <ellipse cx="${cx}" cy="${h * 0.38}" rx="${w * 0.15}" ry="${w * 0.19}" fill="${c}"/>
      <path d="M ${cx - w * 0.38} ${h} C ${cx - w * 0.36} ${h * 0.68}, ${cx - w * 0.12} ${h * 0.6}, ${cx} ${h * 0.6}
               C ${cx + w * 0.12} ${h * 0.6}, ${cx + w * 0.36} ${h * 0.68}, ${cx + w * 0.38} ${h} Z" fill="${c}"/>`;
  },
  /** Overlapping coloured planes, like a small abstract painting. */
  blocks(w, h, palette, rnd) {
    const shapes = Array.from({ length: 7 }, () => {
      const x = rnd() * w * 0.8;
      const y = rnd() * h * 0.8;
      const fill = palette[Math.floor(rnd() * palette.length)];
      return `<rect x="${x}" y="${y}" width="${w * (0.15 + rnd() * 0.45)}" height="${h * (0.1 + rnd() * 0.4)}"
        fill="${fill}" opacity="${0.55 + rnd() * 0.4}" transform="rotate(${rnd() * 20 - 10} ${x} ${y})"/>`;
    }).join('');
    return `<rect width="${w}" height="${h}" fill="${palette[0]}"/>${shapes}`;
  },
  /** Concentric rings, offset: a calm "photo" for the demo series. */
  rings(w, h, [a, b, c], rnd) {
    const cx = w * (0.3 + rnd() * 0.4);
    const cy = h * (0.3 + rnd() * 0.4);
    const rings = Array.from({ length: 8 }, (_, i) => {
      const r = Math.max(w, h) * (0.9 - i * 0.1);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 2 ? b : a}"/>`;
    }).join('');
    return `${rings}<circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) * 0.08}" fill="${c}"/>`;
  },
};

/** Film grain: seeded noise, blended softly over the image. */
function grain(w, h, rnd) {
  const pixels = Buffer.alloc(w * h * 2);
  for (let i = 0; i < w * h; i++) {
    pixels[i * 2] = rnd() > 0.5 ? 255 : 0;
    pixels[i * 2 + 1] = Math.floor(rnd() * 18);
  }
  return sharp(pixels, { raw: { width: w, height: h, channels: 2 } })
    .png()
    .toBuffer();
}

for (const [index, image] of manifest.images.entries()) {
  const { width: w, height: h, kind, palette } = image;
  if (!kinds[kind]) throw new Error(`Unknown kind "${kind}" for ${image.path}`);
  const rnd = random((manifest.seed ?? 1) * 1000 + index);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${kinds[kind](w, h, palette, rnd)}</svg>`;
  const target = path.join(root, image.path);
  await mkdir(path.dirname(target), { recursive: true });
  await sharp(Buffer.from(svg))
    .composite([{ input: await grain(w, h, rnd), blend: 'over' }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(target);
  console.log(`${image.path}  ${w}×${h}  ${kind}`);
}
console.log(`${manifest.images.length} images generated in ${path.relative(process.cwd(), root) || '.'}`);
