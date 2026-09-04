#!/usr/bin/env node
// Copy the stylesheet verbatim into dist/ — it is exported as ./omnibox.css and
// imported by the component's `import './omnibox.css'`, which a bundler resolves
// against this package's dist. Nothing to transform: the rules are plain CSS on
// the host's design tokens (--panel, --line, --r-*, --mono, …).
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(join(root, 'src', 'omnibox.css'), join(root, 'dist', 'omnibox.css'));
console.log('Copied src/omnibox.css -> dist/omnibox.css');
