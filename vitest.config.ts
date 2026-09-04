import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The component suite opts in per file with `@vitest-environment jsdom`;
    // the grammar and registry suites are node-fast by default.
    environment: 'node',
    // The SDK's dist transpiles 1:1 (`bundle: false`), so its internal imports are
    // extensionless relative specifiers — resolvable by Vite's pipeline, not by
    // bare Node ESM. Pull it through the transform instead of externalizing it.
    server: { deps: { inline: [/@immediately-run\/sdk/] } },
  },
});
