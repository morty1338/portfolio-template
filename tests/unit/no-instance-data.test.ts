/**
 * Guard for the template/instance split: no git-tracked file outside the content folders may contain
 * instance data (the owner's name, project slugs, titles, video/Drive IDs). Those live only in the
 * content root, so the code can be shared publicly while the content stays private.
 * The terms are read from the active content root, so the guard works for every instance.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentRoot } from '../../src/config/content-root';

const SKIPPED =
  /^(content(-demo)?|node_modules|dist|\.astro|\.git|material|coverage|test-results|playwright-report)(\/|$)/;
const BINARY = /\.(png|jpe?g|webp|avif|ico|woff2?|gif)$/i;

/** Every file git tracks; without git (e.g. a downloaded ZIP of the template) every file on disk. */
function projectFiles(): string[] {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter(Boolean);
  } catch {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const rel = path.join(dir, e.name);
        if (SKIPPED.test(rel)) return [];
        return e.isDirectory() ? walk(rel) : [rel];
      });
    return walk('.').map((f) => f.replace(/^\.\//, ''));
  }
}

/** The content folders themselves and binaries are not scanned. */
const scanned = projectFiles().filter((f) => !SKIPPED.test(f) && !BINARY.test(f));

function instanceTerms(): string[] {
  const terms = new Set<string>();
  const site = JSON.parse(readFileSync(path.join(contentRoot, 'site.json'), 'utf8'));
  terms.add(site.name);
  terms.add(new URL(site.url).hostname);
  const projects = path.join(contentRoot, 'projects');
  for (const slug of readdirSync(projects).filter((d) => !d.startsWith('_'))) {
    const md = readFileSync(path.join(projects, slug, 'index.md'), 'utf8');
    terms.add(slug);
    const title = md.match(/^title:\s*(.+)$/m)?.[1]?.trim();
    if (title) terms.add(title);
    for (const [, id] of md.matchAll(/(?:youtu\.be\/|[?&]v=|\/d\/|folders\/|vimeo\.com\/)([\w-]{6,})/g)) terms.add(id!);
  }
  return [...terms].filter((t) => t.length >= 4);
}

describe('no instance data outside the content root', () => {
  const terms = instanceTerms();

  it('finds terms to check (sanity check of the guard itself)', () => {
    expect(terms.length).toBeGreaterThan(3);
  });

  it('scans a plausible number of files', () => {
    expect(scanned.length).toBeGreaterThan(30);
  });

  it.each(scanned)('%s', (file) => {
    const text = readFileSync(file, 'utf8');
    expect(terms.filter((t) => text.includes(t))).toEqual([]);
  });
});
