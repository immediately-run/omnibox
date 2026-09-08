import { defineConfig } from "tsup";

// `bundle: false` transpiles each source file 1:1 (like the SDK's build), so the
// component tree stays inspectable and `./launch` / `./omniboxFocus` resolve as
// relative imports inside dist.
//
// ⚠ EVERY MODULE dist REFERENCES MUST BE AN ENTRY. Under `bundle: false` nothing is
// pulled in transitively: a relative import from a listed entry to an UNLISTED module
// is emitted as an import to a file that was never written, and the package 404s at
// runtime in whatever loads it first. That is why `omniboxStyles` and its generated
// half are here — they are imported by `Omnibox.tsx`, not by a consumer.
//
// The stylesheet ships TWICE: baked into `omniboxStyles.generated` as a string (the
// path the component uses) and copied verbatim to `dist/omnibox.css` by
// scripts/build-css.mjs for the `./omnibox.css` export. See that script for why the
// component no longer does `import './omnibox.css'`.
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/Omnibox.tsx",
    "src/launch.ts",
    "src/omniboxFocus.ts",
    "src/omniboxStyles.ts",
    "src/omniboxStyles.generated.ts",
  ],
  format: ["esm", "cjs"],
  bundle: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  external: ["react", "react-dom", "@immediately-run/sdk"],
});
