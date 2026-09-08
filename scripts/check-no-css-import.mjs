#!/usr/bin/env node
// THE GATE THAT PROTECTS THE FRONT DOOR.
//
// On 2026-09-06 this package started shipping `dist/Omnibox.js` with a literal
// `import "./omnibox.css"` in it. immediately.run's sandbox bundler followed that
// specifier out of the resolved package, fetched the stylesheet, and evaluated it as
// JAVASCRIPT — `SyntaxError: Unexpected token '.'` on the very first selector, with
// immediately.run's whole front door dead behind it, in production, for two days.
//
// Nothing in this repo could see it: the source is valid, the types are valid, vitest
// runs under a bundler that understands CSS imports, and `npm run build` succeeds. The
// defect lives in the SHIPPED BYTES and only appears in a consumer that lacks a CSS
// loader. So this reads the shipped bytes.
//
// It also checks the converse — that `dist/omnibox.css` is actually THERE — because the
// build has an order dependency (tsup cleans `dist/`) whose failure ships a package
// whose `./omnibox.css` export 404s, silently, until someone imports it.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/**
 * Any static import, dynamic import, or require of a `.css` specifier in JS source.
 *
 * The `\(?` after `import` is not decoration: `bundle: false` preserves a dynamic
 * `import("./x.css")` verbatim, and it fails in a consumer exactly the same way as the
 * static form. Without it the gate had a false negative on the shape most likely to be
 * reached for as a "safer" workaround.
 *
 * `@` is excluded from the preceding character on purpose. This gate's own biggest input
 * is `dist/omniboxStyles.generated.js` — 5.5 KB of stylesheet inside a JS string — and a
 * stylesheet may contain `@import 'reset.css'`. `JSON.stringify` escapes only DOUBLE
 * quotes, so the single-quoted form reaches the JS source verbatim and would be a false
 * positive on the gate's own production input; this repo's CSS already uses single quotes
 * as house style. Excluding `@` is narrower than requiring a `./` specifier, which would
 * have stopped catching `require("@scope/pkg/style.css")` — a real shape.
 */
const CSS_IMPORT = /(?:^|[^\w$@])(?:import\s*\(?\s*(?:[^'";]*from\s*)?|require\s*\(\s*)['"][^'"]*\.css['"]/;

if (process.argv.includes('--self-test')) {
  const cases = [
    ['detects a bare ESM side-effect import', `import "./omnibox.css";`, true],
    ['detects a CJS require', `var x=require("./omnibox.css");`, true],
    ['detects a single-quoted import', `import './a/b.css'\n`, true],
    ['detects a dynamic import', `const m = import("./omnibox.css");`, true],
    // THE input this gate actually scans, and the one it must not false-positive on:
    // `dist/omniboxStyles.generated.js` is 6 KB of stylesheet text inside a JS string,
    // and a stylesheet may itself contain `@import "…css"`. The previous case here used
    // `".a{}"` — which contains no `.css` at all, so it named this path and exercised
    // nothing.
    ['ignores a double-quoted @import inside baked CSS text', `export const C = "@import \\"reset.css\\";\\n.a{}";`, false],
    // The quote style JSON.stringify does NOT escape, so it reaches the JS verbatim.
    ["ignores a single-quoted @import inside baked CSS text", `export const C = "@import 'reset.css';\\n.a{}";`, false],
    ['still catches another package\'s stylesheet', `require("@scope/pkg/style.css")`, true],
    ['ignores a URL that merely ends in .css', `const href = "https://x/y.css";`, false],
  ];
  let failures = 0;
  for (const [name, src, expected] of cases) {
    if (CSS_IMPORT.test(src) === expected) console.log(`PASS  ${name}`);
    else {
      console.error(`FAIL  ${name}`);
      failures++;
    }
  }
  console.log(`\n${cases.length - failures}/${cases.length} self-test cases.`);
  process.exit(failures ? 1 : 0);
}

if (!existsSync(dist)) {
  console.error('✗ dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

// Every shipped JS file, at ANY depth. `readdirSync` is not recursive, and `tsup` derives
// its output layout from the entry list's common base — so ONE nested entry would put
// files below `dist/` that a top-level-only scan skips while printing PASS over them. A
// gate that reports a count has to have looked at everything it counted.
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [relative(dist, p)];
  });

const js = walk(dist).filter((f) => /\.(js|cjs|mjs)$/.test(f));
if (js.length === 0) {
  console.error('✗ dist/ contains no JavaScript — the check would pass vacuously.');
  process.exit(1);
}

const offenders = js.filter((f) => CSS_IMPORT.test(readFileSync(join(dist, f), 'utf8')));
if (offenders.length) {
  console.error('✗ the SHIPPED JavaScript imports a stylesheet:\n');
  for (const f of offenders) console.error(`    dist/${f}`);
  console.error(
    '\n  A consumer bundling this package may have no CSS loader — immediately.run\n' +
      '  evaluates the stylesheet as JavaScript and the consuming app dies. Import\n' +
      '  `./omniboxStyles` (the baked string) instead of a .css file.',
  );
  process.exit(1);
}

if (!existsSync(join(dist, 'omnibox.css'))) {
  console.error('✗ dist/omnibox.css is missing — the `./omnibox.css` export would 404.');
  console.error('  `tsup` cleans dist/, so `node scripts/build-css.mjs --dist` must run AFTER it.');
  process.exit(1);
}

console.log(`PASS  ${js.length} shipped JS files, none imports a stylesheet; dist/omnibox.css present.`);
