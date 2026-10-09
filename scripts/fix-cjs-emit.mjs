// fix-cjs-emit (R3-1077) — repair tsup's bundle:false CJS rail after the build.
//
// Two defects in every emitted dist/*.cjs, both measured on the published
// 0.2.1–0.5.1 artifacts:
//
//   1. Extensionless relative requires. `require("./Omnibox")` meets whatever
//      sibling the importer's resolver order reaches first — the ESM `.js`
//      build on node (SyntaxError below require(esm), a namespace wrap above
//      it). Every relative require is rewritten to the `.cjs` sibling it
//      means, so the CJS rail reads CJS on every resolver.
//   2. The node-mode interop wrap. esbuild emits
//      `__toESM(require("./Omnibox"), 1)` for a re-exported default; the `1`
//      (isNodeMode) assigns `default = mod` UNCONDITIONALLY, and the sibling
//      is itself a `__toCommonJS` envelope — so `index.cjs`'s `Omnibox` named
//      export was the envelope object, not the component (React's "Element
//      type is invalid … got: object"). Dropping the flag lets __toESM honor
//      the envelope's __esModule marker, and `.default` resolves through it.
//
// The rewrite is fail-closed: an extensionless relative require it does not
// recognize, or a `, 1)` wrap around a require with no `.cjs` sibling, stops
// the build rather than ship a half-fixed rail.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist', import.meta.url).pathname

const REQUIRE_RE = /require\("(\.\.?\/[^"]+)"\)/g

export function fixCjsEmit(source, hasCjsSibling) {
  return source.replace(REQUIRE_RE, (whole, spec) => {
    if (/\.(cjs|js|json|node)$/.test(spec)) return whole
    if (!hasCjsSibling(spec)) {
      throw new Error(`fix-cjs-emit: extensionless require("${spec}") has no .cjs sibling in dist — refusing to guess`)
    }
    return `require("${spec}.cjs")`
  })
}

export function dropNodeModeWrap(source) {
  // Only local-sibling requires carry the envelope problem; a bare specifier
  // (react, …) keeps its flag.
  return source.replace(/__toESM\((require\("(\.\.?\/[^"]+)"\)), 1\)/g, '__toESM($1)')
}

let touched = 0
for (const name of readdirSync(dist)) {
  if (!name.endsWith('.cjs')) continue
  const path = join(dist, name)
  const before = readFileSync(path, 'utf8')
  const after = dropNodeModeWrap(
    fixCjsEmit(before, (spec) => existsSync(join(dist, `${spec.replace(/^\.\//, '')}.cjs`))),
  )
  if (after !== before) {
    writeFileSync(path, after)
    touched += 1
  }
  const leftover = after.match(REQUIRE_RE)?.filter((m) => !/\.(cjs|js|json|node)"\)$/.test(m))
  if (leftover && leftover.length > 0) {
    throw new Error(`fix-cjs-emit: ${name} still holds extensionless relative requires: ${leftover.join(', ')}`)
  }
}
console.log(`fix-cjs-emit: rewrote ${touched} dist/*.cjs file(s)`)
