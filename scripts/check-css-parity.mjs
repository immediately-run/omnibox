#!/usr/bin/env node
// The generated CSS-as-JS module is COMMITTED (so tests and `tsc` see it without a
// build), which means it can drift from `src/omnibox.css` — the exact failure mode a
// generated-but-committed artifact always has. This is the gate.
//
// `--self-test` proves the gate can fail, because a parity check that cannot is worse
// than none: it reads as verified.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The CSS the generated module carries, or `null` if it does not parse as expected. */
function bakedCss(source) {
  const m = source.match(/^export const OMNIBOX_CSS = (".*");$/m);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

if (process.argv.includes('--self-test')) {
  const cases = [
    ['detects a changed byte', 'a {}', 'export const OMNIBOX_CSS = "a {} ";'],
    ['detects an empty bake', 'a {}', 'export const OMNIBOX_CSS = "";'],
    ['detects an unparseable module', 'a {}', 'export const OMNIBOX_CSS = someVariable;'],
    ['passes on an exact match', 'a {}', 'export const OMNIBOX_CSS = "a {}";'],
  ];
  let failures = 0;
  for (const [name, css, mod] of cases) {
    const agrees = bakedCss(mod) === css;
    const expected = name.startsWith('passes');
    if (agrees === expected) console.log(`PASS  ${name}`);
    else {
      console.error(`FAIL  ${name}`);
      failures++;
    }
  }
  console.log(`\n${cases.length - failures}/${cases.length} self-test cases.`);
  process.exit(failures ? 1 : 0);
}

const css = readFileSync(join(root, 'src', 'omnibox.css'), 'utf8');
const baked = bakedCss(readFileSync(join(root, 'src', 'omniboxStyles.generated.ts'), 'utf8'));

if (baked === null) {
  console.error('✗ src/omniboxStyles.generated.ts does not carry a parseable OMNIBOX_CSS string.');
  console.error('  Run `npm run build:css`.');
  process.exit(1);
}
if (baked !== css) {
  console.error('✗ src/omniboxStyles.generated.ts has drifted from src/omnibox.css.');
  console.error(`  css ${css.length} bytes, baked ${baked.length} bytes. Run \`npm run build:css\`.`);
  process.exit(1);
}
console.log(`PASS  src/omniboxStyles.generated.ts matches src/omnibox.css (${css.length} bytes).`);
