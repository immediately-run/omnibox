# @immediately-run/omnibox

The front door's omnibox (R3-512; FRONT_DOOR_IA §5): one WAI-ARIA
list-autocomplete combobox that runs a repository by URL or
`provider:namespace/repository@ref` tuple and searches a consumer's app
directory and docs. Shared by landing-page and the Home app so there is one
component and one grammar (R3-530) — the brief's rejection of a second paste
box.

## What it owns, and what it does not

- **Owned:** `Omnibox` (the component), `parseLaunch` + the `Launch` grammar
  (pure, no React, no SDK, no network), the cross-instance focus registry, and
  the stylesheet (`./omnibox.css`, `.kbd` included).
- **Injected:** the data. `hits.apps` and `hits.docs` are the consumer's
  sources; the package ranks and orders the app candidates (name > repo >
  blurb > category) but imports no consumer records. An app-row chip comes
  back through `renderChip` — chips are site components with site data types.
  An `<Omnibox>` with no `hits` is the launch grammar only — the Home app's
  shape.

## Peer dependencies

`react` and `@immediately-run/sdk` (the `PlatformLink` subpath, which builds
host-space hrefs and escapes the sandboxed frame). Both are peer deps, never
bundled.
