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
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/** Any import/require of a `.css` specifier in JS source. */
const CSS_IMPORT = /(?:^|[^\w$])(?:import\s*(?:[^'";]*from\s*)?|require\s*\(\s*)['"][^'"]*\.css['"]/;

if (process.argv.includes('--self-test')) {
  const cases = [
    ['detects a bare ESM side-effect import', `import "./omnibox.css";`, true],
    ['detects a CJS require', `var x=require("./omnibox.css");`, true],
    ['detects a single-quoted import', `import './a/b.css'\n`, true],
    ['ignores the word omnibox.css inside a comment-free string of CSS text', `export const C = ".a{}";`, false],
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

const js = readdirSync(dist).filter((f) => /\.(js|cjs|mjs)$/.test(f));
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
