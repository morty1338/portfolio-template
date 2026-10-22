#!/usr/bin/env node
/**
 * Downloads the YouTube thumbnail of every project with a YouTube `video:` and no
 * thumbnail.jpg yet, and saves it next to the project's index.md. The file is committed,
 * so builds stay offline and visitors never load anything from YouTube before they click play.
 *
 * Usage: node scripts/fetch-youtube-thumbnails.mjs [--force]
 * Afterwards add `thumbnail: ./thumbnail.jpg` to the project's frontmatter (the script reports where it's missing).
 */
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { contentRoot } from '../src/config/content-root.ts';
import { parseVideoUrl, youtubeThumbnailUrls } from '../src/lib/video.ts';

const PROJECTS = path.join(contentRoot, 'projects');
const force = process.argv.includes('--force');
const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );

async function download(id) {
  for (const url of youtubeThumbnailUrls(id)) {
    const res = await fetch(url);
    // Missing sizes answer 404 (with a grey placeholder image), so only accept 200.
    if (res.ok) return { url, bytes: Buffer.from(await res.arrayBuffer()) };
  }
  throw new Error(`no thumbnail found for YouTube video ${id}`);
}

let failed = 0;
for (const slug of (await readdir(PROJECTS)).filter((d) => !d.startsWith('_')).sort()) {
  const file = path.join(PROJECTS, slug, 'index.md');
  if (!(await exists(file))) continue;
  const source = await readFile(file, 'utf8');
  const videoUrl = source.match(/^video:\s*['"]?([^'"\s]+)/m)?.[1];
  if (!videoUrl) continue;
  const video = parseVideoUrl(videoUrl);
  if (video.provider !== 'youtube') continue;

  const target = path.join(PROJECTS, slug, 'thumbnail.jpg');
  if ((await exists(target)) && !force) {
    console.log(`skip  ${slug} (thumbnail.jpg exists)`);
  } else {
    try {
      const { url, bytes } = await download(video.id);
      await writeFile(target, bytes);
      console.log(`saved ${slug}/thumbnail.jpg  ← ${url.split('/').pop()} (${Math.round(bytes.length / 1024)} KB)`);
    } catch (err) {
      failed++;
      console.error(`error ${slug}: ${err.message}`);
    }
  }
  if (!/^thumbnail:/m.test(source)) console.warn(`note  ${slug}: add "thumbnail: ./thumbnail.jpg" to its frontmatter`);
}
process.exit(failed ? 1 : 0);
