/**
 * The contact function must load as plain Node ESM, the way Vercel runs it: every file of its import
 * graph is compiled to JavaScript on its own (import paths unchanged) and loaded by Node, which
 * requires file extensions on relative imports. Vitest and Astro resolve extensionless paths
 * themselves, so without this test the deployed function can fail while every other test passes
 * (BUGS.md #13).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ENTRY = 'api/contact.ts';
const RELATIVE_IMPORT = /(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** All local TypeScript files the entry imports, directly or indirectly. */
function moduleGraph(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
      visit(path.join(path.dirname(file), spec!.replace(/\.js$/, '')) + '.ts');
    }
  };
  visit(entry);
  return [...seen];
}

describe('api/contact.ts as plain Node ESM', () => {
  it('loads and answers a GET with 405', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'fn-esm-'));
    writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
    for (const file of moduleGraph(ENTRY)) {
      const js = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const dest = path.join(out, file.replace(/\.ts$/, '.js'));
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, js);
    }

    const script = `
      const { POST } = await import(${JSON.stringify(path.join(out, 'api/contact.js'))});
      const res = await POST(new Request('https://site.example/api/contact', { method: 'GET' }));
      console.log(res.status);
    `;
    let output: string;
    try {
      output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    } catch (error) {
      rmSync(out, { recursive: true, force: true });
      // Show Node's own error (e.g. ERR_MODULE_NOT_FOUND) instead of a bare exit code.
      throw new Error(
        String((error as { stderr?: string }).stderr ?? error)
          .split('\n')
          .slice(0, 6)
          .join('\n'),
      );
    }
    rmSync(out, { recursive: true, force: true });
    expect(output.trim()).toBe('405');
  });
});
