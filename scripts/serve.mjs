#!/usr/bin/env node
/**
 * Serves the built site (dist/) with `Cache-Control: no-cache`, so the browser always revalidates
 * and never runs a stale page after a rebuild (docs/PLAYBOOK.md §13). Used for local checks,
 * Playwright and Lighthouse. Directory URLs serve their index.html; unknown paths get dist/404.html.
 *
 * Usage: node scripts/serve.mjs [--port 4321] [--dir dist]
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const port = Number(arg('port', process.env.PORT ?? 4321));
const root = path.resolve(arg('dir', 'dist'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const file = path.join(root, decoded);
  if (file !== root && !file.startsWith(root + path.sep)) return null; // no path traversal out of dist/ (or into dist-*/)
  const info = await stat(file).catch(() => null);
  if (info?.isFile()) return file;
  if (info?.isDirectory()) {
    const index = path.join(file, 'index.html');
    if (await stat(index).catch(() => null)) return index;
  }
  return null;
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? '/');
  const notFound = file ? null : path.join(root, '404.html');
  const target = file ?? ((await stat(notFound).catch(() => null)) ? notFound : null);
  res.setHeader('Cache-Control', 'no-cache');
  if (!target) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  res.writeHead(file ? 200 : 404, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
  createReadStream(target).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://localhost:${port} (no-cache)`));
