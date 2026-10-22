#!/usr/bin/env node
/**
 * README screenshots of the built site (run `npm run build` first). Uses the installed Chrome
 * (Playwright `channel: "chrome"`, no browser download) and real device emulation for phones.
 *
 * Usage: node scripts/screenshots.mjs [outDir=docs/screenshots]
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const outDir = path.resolve(process.argv[2] ?? 'docs/screenshots');
const PORT = 4399;
const base = `http://localhost:${PORT}`;

const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ channel: 'chrome' });
await mkdir(outDir, { recursive: true });

// Pick the pages from the built site (first film, first photo series), so the script works with any content.
const probe = await browser.newPage();
await probe.goto(`${base}/work/`);
const firstProject = (section) =>
  probe
    .locator(`${section} a[data-track="project-open"]`)
    .first()
    .getAttribute('href', { timeout: 2000 })
    .catch(() => null);
const film = await firstProject('#cinematography');
const series = await firstProject('#photography');
await probe.close();

const desktop = { width: 1280, height: 800 };
const phone = { width: 375, height: 812 };
const shots = [
  { name: 'home-desktop', path: '/', viewport: desktop },
  { name: 'work-desktop', path: '/work/', viewport: desktop, scrollTo: '#cinematography' },
  film && { name: 'project-desktop', path: film, viewport: desktop },
  { name: 'home-mobile', path: '/', viewport: phone, mobile: true },
  series && { name: 'gallery-mobile', path: `/de${series}`, viewport: phone, mobile: true, scrollTo: '.photos' },
  series && { name: 'lightbox-mobile', path: series, viewport: phone, mobile: true, click: '.photos a' },
].filter(Boolean);

try {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: 2,
      isMobile: shot.mobile ?? false,
      hasTouch: shot.mobile ?? false,
      reducedMotion: 'reduce',
    });
    // Screenshots must not depend on the outside world (e.g. a YouTube request).
    await context.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
    const page = await context.newPage();
    await page.goto(base + shot.path, { waitUntil: 'networkidle' });
    if (shot.scrollTo) await page.locator(shot.scrollTo).first().scrollIntoViewIfNeeded();
    if (shot.click) {
      await page.locator(shot.click).first().click();
      await page.waitForTimeout(600);
    }
    // Lazy images below the fold: wait until every visible image has loaded.
    await page.evaluate(() =>
      Promise.all([...document.images].filter((i) => !i.complete).map((i) => i.decode().catch(() => {}))),
    );
    const png = await page.screenshot();
    const file = path.join(outDir, `${shot.name}.webp`);
    await sharp(png)
      .resize({ width: Math.round(shot.viewport.width * 1.5) })
      .webp({ quality: 80 })
      .toFile(file);
    console.log(`${path.relative(process.cwd(), file)}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
