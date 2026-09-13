// R3-624 — the packaging facts no runtime test can see. Both halves of the
// 2026-09-06 outage were packaging facts: an `exports` map whose conditions the
// platform's resolver could not reach, and a tarball that did not carry what the
// map named. This case reads the repo's OWN package.json (the real producer,
// R2) and asserts the two invariants that make the two-rail design real:
//
//   1. every path `exports` names either exists in the repo (source — what a
//      library MOUNT aliases) or is covered by `files` (built — what the npm
//      tarball carries);
//   2. no exported source file contains a raw `.css` import — the stylesheet
//      ships as the generated JS string precisely so no bundler can follow a
//      css specifier out of this package (R3-565; the sandbox evaluates it as
//      JavaScript).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The one home for the css-import shape (R6): the SHIPPED-bytes gate recognizes
// static, single-quoted, require and dynamic forms — the source scan must not
// re-spell a weaker second pattern.
import { CSS_IMPORT } from '../scripts/check-no-css-import.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Every string path the `exports` map names, whatever condition names it. */
function exportPaths(map: unknown): string[] {
  if (typeof map === 'string') return [map];
  if (map === null || typeof map !== 'object') return [];
  return Object.values(map as Record<string, unknown>).flatMap(exportPaths);
}

const filesGlobs: string[] = pkg.files ?? [];
const coveredByFiles = (p: string) => filesGlobs.some((g) => p === g || p.startsWith(`${g}/`));

/** Non-test .ts/.tsx files under src/ — the exported source graph. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name) ? [p] : [];
  });
}

describe('the package names resolvable paths (R3-624)', () => {
  it('every path exports names exists in the repo or is covered by files', () => {
    expect(Object.keys(pkg.exports)).toContain('.');
    for (const target of exportPaths(pkg.exports)) {
      const rel = target.replace(/^\.\//, '');
      if (existsSync(join(root, rel))) continue; // present as source (a mount resolves it)
      expect(coveredByFiles(rel)).toBe(true); // else the tarball must carry it after build
    }
  });

  it('the browser condition names source that exists — what a library mount resolves', () => {
    const entry = (pkg.exports as Record<string, Record<string, string>>)['.'];
    expect(entry.browser).toMatch(/^\.\/src\//);
    expect(existsSync(join(root, entry.browser.replace(/^\.\//, '')))).toBe(true);
    // and that source is in the tarball, so the npm rail serves the same shape
    expect(filesGlobs).toContain('src');
  });

  it('no exported source file contains a raw .css import', () => {
    // Comments name the historical import (`WHY NOT import './omnibox.css'`) —
    // strip them so the scan sees code, not history.
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    const offenders = sourceFiles(join(root, 'src')).filter((f) =>
      CSS_IMPORT.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });
});
