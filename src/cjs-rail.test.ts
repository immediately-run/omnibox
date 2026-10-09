// R3-1077 — the CJS rail's regression pin, read from the ARTIFACT (the npm
// pack tarball), never the source tree: R3-577's live leg proved the
// extensionless require now meets the .cjs sibling and STILL got the
// __toCommonJS envelope back as the `Omnibox` named export (React's "Element
// type is invalid … got: object"). The probe is the same one the venue used:
// require the packed package's CJS entry and ask typeof Omnibox.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
// The one spelling of the require shape lives in the build script (R6) — a
// re-spelled copy here would be exactly the weaker second pattern
// packaging.test.ts refuses for CSS_IMPORT.
import { REQUIRE_RE, dropNodeModeWrap, fixCjsEmit } from '../scripts/fix-cjs-emit.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'omnibox-pack-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let cached: string | undefined;
function unpackTarball(): string {
  if (cached) return cached;
  // npm pack runs `prepare` (the build), so the tarball is THIS commit's emit.
  const name = execFileSync('npm', ['pack', '--pack-destination', dir], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .pop()!;
  execFileSync('tar', ['-xzf', join(dir, name), '-C', dir]);
  const unpacked = join(dir, 'package');
  // The tarball carries no node_modules; react resolves from THIS repo's
  // install, exactly as a consumer's install would provide it. The SDK peer
  // is stubbed: the probe is the omnibox package's OWN emit shape, and the
  // SDK's dist has its own extensionless-import rail, which is not this
  // item's surface.
  mkdirSync(join(unpacked, 'node_modules', '@immediately-run', 'sdk'), { recursive: true });
  symlinkSync(join(root, 'node_modules', 'react'), join(unpacked, 'node_modules', 'react'), 'dir');
  symlinkSync(join(root, 'node_modules', 'react-dom'), join(unpacked, 'node_modules', 'react-dom'), 'dir');
  const sdkStub = join(unpacked, 'node_modules', '@immediately-run', 'sdk');
  writeFileSync(
    join(sdkStub, 'package.json'),
    JSON.stringify({ name: '@immediately-run/sdk', version: '0.0.0-stub', type: 'commonjs', main: './index.cjs', exports: { './platformLink': './index.cjs' } }),
  );
  writeFileSync(join(sdkStub, 'index.cjs'), 'exports.PlatformLink = function PlatformLink() { return null };\n');
  cached = unpacked;
  return unpacked;
}

describe('fix-cjs-emit, fail-closed (R3-1077 review: the guard branches need their own pin)', () => {
  const hasSibling = (spec: string) => spec === './Omnibox';

  it('rewrites an extensionless relative require to its .cjs sibling, in either quote style', () => {
    expect(fixCjsEmit('var a = require("./Omnibox");', hasSibling)).toBe('var a = require("./Omnibox.cjs");');
    expect(fixCjsEmit("var a = require('./Omnibox');", hasSibling)).toBe("var a = require('./Omnibox.cjs');");
  });

  it('leaves an already-explicit or bare require alone', () => {
    expect(fixCjsEmit('var a = require("./Omnibox.cjs");', hasSibling)).toBe('var a = require("./Omnibox.cjs");');
    expect(fixCjsEmit('var r = require("react");', hasSibling)).toBe('var r = require("react");');
  });

  it('throws when the extensionless require has no .cjs sibling', () => {
    expect(() => fixCjsEmit('var a = require("./Missing");', hasSibling)).toThrow(/no \.cjs sibling/);
  });

  it('dropNodeModeWrap drops the flag on local requires and keeps it on bare specifiers', () => {
    expect(dropNodeModeWrap('var a = __toESM(require("./Omnibox.cjs"), 1);')).toBe(
      'var a = __toESM(require("./Omnibox.cjs"));',
    );
    expect(dropNodeModeWrap("var a = __toESM(require('./Omnibox'), 1);")).toBe("var a = __toESM(require('./Omnibox'));");
    expect(dropNodeModeWrap('var r = __toESM(require("react"), 1);')).toBe('var r = __toESM(require("react"), 1);');
  });
});

describe('the packed CJS entry (R3-1077)', () => {
  it('yields the component as the Omnibox named export, not the interop envelope', () => {
    const unpacked = unpackTarball();
    const req = createRequire(join(unpacked, 'package.json'));
    const entry = req(join(unpacked, 'dist/index.cjs'));
    expect(typeof entry.Omnibox).toBe('function');
    expect(typeof entry.parseLaunch).toBe('function');
    expect(typeof entry.RUN_LABEL).toBe('string');
  });

  it('no dist/*.cjs in the tarball holds an extensionless relative require', () => {
    const unpacked = unpackTarball();
    const distFiles = readdirSync(join(unpacked, 'dist'));
    for (const f of distFiles.filter((f) => f.endsWith('.cjs'))) {
      const text = readFileSync(join(unpacked, 'dist', f), 'utf8');
      const bad = [...text.matchAll(REQUIRE_RE)].filter((m) => !/\.(cjs|js|json|node)$/.test(m[2]));
      expect(bad, `${f}: ${bad.map((m) => m[0]).join(', ')}`).toEqual([]);
    }
  });
});
