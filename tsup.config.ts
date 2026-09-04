import { defineConfig } from "tsup";

// `bundle: false` transpiles each source file 1:1 (like the SDK's build), so the
// component tree stays inspectable and `./launch` / `./omniboxFocus` resolve as
// relative imports inside dist. The stylesheet is not transpiled — it is copied
// verbatim to dist by scripts/build-css.mjs and exported as ./omnibox.css.
export default defineConfig({
  entry: ["src/index.ts", "src/Omnibox.tsx", "src/launch.ts", "src/omniboxFocus.ts"],
  format: ["esm", "cjs"],
  bundle: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  external: ["react", "react-dom", "@immediately-run/sdk"],
});
