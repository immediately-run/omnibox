// The launch parser (R3-511; FRONT_DOOR_IA §5.2) — turns what a visitor types
// into the omnibox into a present route, a typed rejection for an unknown
// provider, or free text. Pure: no React, no SDK, no network. The site cannot
// check that a repo EXISTS — existence is the host's job after navigation.
//
// Grammar, in the order the parser tries them:
//   1. a platform URL (any *.immediately.run host with a /present/ or /edit/
//      path) — passed through; the caller resolves it against the current host
//      origin.
//   2. a provider-prefixed tuple (`github:acme/todo@dev` — the corpus location
//      grammar) or a bare tuple (`acme/todo@feat/x`) with the default provider.
//   3. a provider URL (`https://github.com/acme/todo/tree/feat/x`).
//   4. anything else is free text (search only).

/** The known providers: the prefix/spelling a user may type, and the URL host
 *  that names the same provider. A second provider is a row here (FRONT_DOOR_IA
 *  §5.1 — the chip renders one static option per row). */
export const PROVIDERS: Readonly<Record<string, string>> = {
  github: 'github.com',
};

const DEFAULT_PROVIDER = 'github';

export type Launch =
  | {
      kind: 'location';
      provider: string;
      namespace: string;
      repository: string;
      ref?: string;
      /** What the results row shows, e.g. `github:acme/todo@feat/x`. */
      display: string;
      /** A root-relative platform path, e.g. `/present/github/acme/todo/feat%2Fx`. */
      presentPath: string;
    }
  | { kind: 'platform-url'; path: string }
  | { kind: 'unknown-provider'; provider: string }
  | { kind: 'text'; query: string };

/** The `/present/…` path for a location. The ref is encoded ONCE — matching the
 *  host's `encodeRef` (site-main `src/editor/shared.ts`), so a ref containing
 *  `/` stays one segment. `/files/{entry}` is deliberately never appended: the
 *  host resolves the app's entry from `package.json`. */
function presentPathOf(provider: string, namespace: string, repository: string, ref?: string): string {
  const base = `/present/${provider}/${namespace}/${repository}`;
  return ref ? `${base}/${encodeURIComponent(ref)}` : base;
}

function location(provider: string, namespace: string, repository: string, ref?: string): Launch {
  const display = ref
    ? `${provider}:${namespace}/${repository}@${ref}`
    : `${provider}:${namespace}/${repository}`;
  return { kind: 'location', provider, namespace, repository, ...(ref ? { ref } : {}), display, presentPath: presentPathOf(provider, namespace, repository, ref) };
}

/** `gitlab.com` → `gitlab`: the label we can honestly name for a repo-URL on a
 *  host we do not support. Documented shorthand, not a claim about the host. */
function providerLabel(hostname: string): string {
  return hostname.replace(/^www\./, '').split('.')[0];
}

/** Parse a `<ns>/<repo>[@<ref>]` tuple. Returns null when the input is not one
 *  (wrong shape, missing pieces). The REF may contain `/` (`@feat/x`), so the
 *  tail after the namespace is parsed left-to-right, not split on `/`. */
function parseTuple(rest: string, provider: string): Launch | null {
  const slash = rest.indexOf('/');
  if (slash <= 0) return null; // need `<ns>/<repo>`; `acme/` and `acme` are text.
  const namespace = rest.slice(0, slash);
  const tail = rest.slice(slash + 1);
  if (!namespace || !tail) return null;
  const at = tail.indexOf('@');
  const repository = at === -1 ? tail : tail.slice(0, at);
  const ref = at === -1 ? undefined : tail.slice(at + 1);
  if (!repository || repository.includes('/')) return null; // only the ref may span segments
  if (ref !== undefined && !ref) return null; // `ns/repo@` — dangling @.
  return location(provider, namespace, repository, ref);
}

export function parseLaunch(input: string, defaultProvider: string = DEFAULT_PROVIDER): Launch {
  const raw = input.trim();
  if (!raw) return { kind: 'text', query: raw };

  // 1. URLs.
  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { kind: 'text', query: raw };
    }
    const host = url.hostname.toLowerCase();

    // This platform: pass the path (with search/hash) through; the caller
    // resolves it against the current host origin.
    if (host === 'immediately.run' || host.endsWith('.immediately.run')) {
      if (/^\/(present|edit)(\/|$)/.test(url.pathname)) {
        return { kind: 'platform-url', path: url.pathname + url.search + url.hash };
      }
      return { kind: 'text', query: raw };
    }

    const providerEntry = Object.entries(PROVIDERS).find(([, urlHost]) => urlHost === host);
    if (providerEntry) {
      const [provider] = providerEntry;
      const segs = url.pathname.split('/').filter(Boolean);
      if (segs.length < 2) return { kind: 'text', query: raw };
      const [namespace, repo0] = segs;
      const repo = repo0!.endsWith('.git') ? repo0!.slice(0, -4) : repo0!;
      if (!repo) return { kind: 'text', query: raw };
      // `/tree/<rest>` → the ref is the WHOLE remainder (a ref may contain `/`);
      // `/blob/<first>` → the ref is the FIRST segment; the file path is dropped.
      // Documented limitation: a /blob/ URL on a ref containing `/` is misread —
      // the interpreted location is shown in the results row so it can be
      // corrected. Any other extra segment is not a repo root → free text.
      if (segs.length > 2) {
        const [marker, ...extra] = segs.slice(2);
        if (marker === 'tree' && extra.length > 0) {
          return location(provider, namespace, repo, extra.join('/'));
        }
        if (marker === 'blob' && extra.length > 0) {
          return location(provider, namespace, repo, extra[0]);
        }
        return { kind: 'text', query: raw };
      }
      return location(provider, namespace, repo);
    }

    // A repo-shaped URL on a host we cannot reach: name what was understood.
    const segs = url.pathname.split('/').filter(Boolean);
    if (segs.length >= 2) return { kind: 'unknown-provider', provider: providerLabel(host) };
    return { kind: 'text', query: raw };
  }

  // 2. Provider-prefixed tuple (`github:acme/todo@dev`).
  const colon = raw.indexOf(':');
  if (colon > 0 && !raw.slice(0, colon).includes('/')) {
    const provider = raw.slice(0, colon).toLowerCase();
    const rest = raw.slice(colon + 1);
    if (provider in PROVIDERS) {
      const parsed = parseTuple(rest, provider);
      return parsed ?? { kind: 'text', query: raw };
    }
    return { kind: 'unknown-provider', provider };
  }

  // 3. Bare tuple with the default provider.
  const tuple = parseTuple(raw, defaultProvider);
  if (tuple) return tuple;

  // 4. Free text — search only.
  return { kind: 'text', query: raw };
}
