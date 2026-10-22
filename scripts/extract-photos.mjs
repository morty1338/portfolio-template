#!/usr/bin/env node
/**
 * Cuts individual photos out of screenshots of layout spreads
 * (photos placed on a plain, uniform page background).
 *
 * Usage:
 *   node scripts/extract-photos.mjs <inputDir> <outputDir> [--boxes boxes.json] [--dry-run]
 *
 * - Screenshots are processed in filename order; photos inside one screenshot in
 *   reading order (top-to-bottom, then left-to-right). Output: 01.jpg, 02.jpg, …
 * - Photos that touch or overlap can't be separated automatically. For those,
 *   pass manual crop boxes: { "<filename>": [[left, top, width, height], …] } in
 *   source pixels. A file listed there skips auto-detection.
 * - Output JPEGs carry no metadata (sharp strips EXIF by default).
 *
 * This is a stopgap until the original photo files are available.
 */
import { readdir, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const CELL = 4; // px; detection runs on a grid of CELL×CELL cells
const COLOR_TOLERANCE = 10; // max channel difference still counted as background
const MIN_AREA_RATIO = 0.01; // components smaller than this share of the image are noise
const INSET = 2; // px trimmed from each edge to drop anti-aliased seams

function parseArgs(argv) {
  const args = { positional: [], boxes: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--boxes') args.boxes = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else args.positional.push(argv[i]);
  }
  if (args.positional.length !== 2) {
    console.error('Usage: extract-photos.mjs <inputDir> <outputDir> [--boxes boxes.json] [--dry-run]');
    process.exit(1);
  }
  return args;
}

/** Returns photo boxes [left, top, width, height] in reading order. */
export function detectBoxes(data, width, height, channels) {
  const bg = [data[0], data[1], data[2]];
  const isForeground = (x, y) => {
    const i = (y * width + x) * channels;
    return (
      Math.abs(data[i] - bg[0]) > COLOR_TOLERANCE ||
      Math.abs(data[i + 1] - bg[1]) > COLOR_TOLERANCE ||
      Math.abs(data[i + 2] - bg[2]) > COLOR_TOLERANCE
    );
  };

  // 1. Coarse grid: a cell is foreground when most of its pixels are.
  const cols = Math.floor(width / CELL);
  const rows = Math.floor(height / CELL);
  const grid = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let fg = 0;
      for (let y = cy * CELL; y < (cy + 1) * CELL; y++)
        for (let x = cx * CELL; x < (cx + 1) * CELL; x++) if (isForeground(x, y)) fg++;
      grid[cy * cols + cx] = fg * 2 > CELL * CELL ? 1 : 0;
    }
  }

  // 2. Connected components (8-neighbourhood) via iterative flood fill.
  const label = new Int32Array(cols * rows);
  const boxes = [];
  let next = 1;
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || label[start]) continue;
    let minX = Infinity,
      minY = Infinity,
      maxX = -1,
      maxY = -1,
      area = 0;
    const stack = [start];
    label[start] = next;
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % cols,
        y = (idx - x) / cols;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (grid[n] && !label[n]) {
            label[n] = next;
            stack.push(n);
          }
        }
    }
    next++;
    if (area * CELL * CELL < MIN_AREA_RATIO * width * height) continue;
    boxes.push([
      minX * CELL + INSET,
      minY * CELL + INSET,
      (maxX - minX + 1) * CELL - 2 * INSET,
      (maxY - minY + 1) * CELL - 2 * INSET,
    ]);
  }

  return sortReadingOrder(boxes);
}

/** Top-to-bottom by row band, left-to-right inside a band. */
export function sortReadingOrder(boxes) {
  const sorted = [...boxes].sort((a, b) => a[1] - b[1]);
  const bands = [];
  for (const box of sorted) {
    const band = bands.find((b) => box[1] < b.top + b.height / 2);
    if (band) band.items.push(box);
    else bands.push({ top: box[1], height: box[3], items: [box] });
  }
  return bands.flatMap((b) => b.items.sort((a, c) => a[0] - c[0]));
}

async function main() {
  const {
    positional: [inputDir, outputDir],
    boxes: boxesFile,
    dryRun,
  } = parseArgs(process.argv.slice(2));
  const manualBoxes = boxesFile ? JSON.parse(await readFile(boxesFile, 'utf8')) : {};
  const files = (await readdir(inputDir)).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  if (!dryRun) await mkdir(outputDir, { recursive: true });

  let count = 0;
  for (const file of files) {
    const source = path.join(inputDir, file);
    let boxes = manualBoxes[file];
    if (!boxes) {
      const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      boxes = detectBoxes(data, info.width, info.height, info.channels);
    }
    for (const [left, top, width, height] of boxes) {
      count++;
      const name = `${String(count).padStart(2, '0')}.jpg`;
      console.log(`${name}  ${width}×${height}  ← ${file} @ ${left},${top}`);
      if (!dryRun) {
        await sharp(source)
          .extract({ left, top, width, height })
          .toColorspace('srgb')
          .jpeg({ quality: 92, mozjpeg: true })
          .toFile(path.join(outputDir, name));
      }
    }
  }
  console.log(`${count} photos ${dryRun ? 'detected' : `written to ${outputDir}`}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
