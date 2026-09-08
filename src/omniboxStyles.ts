// Injecting the omnibox's stylesheet from JS, once per document.
//
// WHY NOT `import './omnibox.css'`. That is what the package shipped until 2026-09-08,
// and on immediately.run it took down the front door. The sandbox bundler followed the
// specifier out of the resolved package, fetched the stylesheet, and evaluated it as
// JAVASCRIPT: `SyntaxError: Unexpected token '.'` on the first selector, the whole app
// dead behind it, prod and local alike. An app's OWN `.css` import works there; a
// dependency's did not, and this package cannot make a consumer's bundler grow a CSS
// loader. JS is the one thing every consumer can execute, so the styles ship as JS.
//
// `dist/omnibox.css` is still published and still exported at `./omnibox.css`, for a
// consumer that would rather own the cascade — importing it as well is harmless (the
// rules are identical and idempotent), it just is not required any more.
import { OMNIBOX_CSS } from './omniboxStyles.generated';

/** Marks the injected element, and makes a second injection a no-op. */
const STYLE_ID = 'immediately-run-omnibox-css';

/**
 * Ensure the omnibox stylesheet is in `document`. Idempotent, and safe to call from
 * render: it writes nothing when the element is already there.
 *
 * Deliberately defensive rather than clever:
 * - **no `document` is not an error.** SSR and any non-DOM renderer simply get no
 *   styles rather than a crash on import, and this module is imported at module scope.
 * - **a throwing DOM is not an error either.** Some embeddings forbid injecting a
 *   style element; an unstyled combobox is a bad outcome, a dead app is a worse one,
 *   and the caller has no way to recover from either.
 * - the element carries an `id`, so a second copy of this package on the page (a
 *   version skew in one consumer's tree) styles the DOM once, not twice.
 */
export function ensureOmniboxStyles(): void {
  try {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = OMNIBOX_CSS;
    (document.head ?? document.documentElement).appendChild(style);
  } catch (err) {
    // Unstyled beats dead — but silent beats neither. Three different failures land here
    // (no `head` or `documentElement`, an embedding that refuses `createElement('style')`,
    // a refused `textContent` assignment) and without this they are indistinguishable
    // from "the styles are fine", which is how an unstyled combobox goes unreported.
    // `console.warn` and not `throw`: the caller can recover from neither outcome.
    try {
      console.warn('[omnibox] could not inject the stylesheet; rendering unstyled.', err);
    } catch {
      /* a console that throws must not be the thing that breaks the render. */
    }
  }
}
