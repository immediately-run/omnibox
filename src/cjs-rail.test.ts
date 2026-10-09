// R3-1077 — the CJS rail's regression pin, read from the ARTIFACT (the npm
// pack tarball), never the source tree: R3-577's live leg proved the
// extensionless require now meets the .cjs sibling and STILL got the
// __toCommonJS envelope back as the `Omnibox` named export (React's "Element
// type is invalid … got: object"). The probe is the same one the venue used:
// require the packed package's CJS entry and ask typeof Omnibox.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';

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
    const distFiles = execFileSync('ls', [join(unpacked, 'dist')], { encoding: 'utf8' }).split('\n');
    for (const f of distFiles.filter((f) => f.endsWith('.cjs'))) {
      const text = readFileSync(join(unpacked, 'dist', f), 'utf8');
      const bad = [...text.matchAll(/require\("(\.\.?\/[^"]+)"\)/g)].filter(
        (m) => !/\.(cjs|js|json|node)$/.test(m[1]),
      );
      expect(bad, `${f}: ${bad.map((m) => m[0]).join(', ')}`).toEqual([]);
    }
  });
});
