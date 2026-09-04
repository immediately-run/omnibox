// Cross-component focus plumbing for the omnibox. The nav field on `/` activates
// the hero omnibox, ⌘K focuses whichever omnibox is mounted, and the two "paste a
// repo" buttons further down `/` scroll the hero field into view and focus it.
// The mounted instances publish their handles here on mount — a module registry,
// not prop drilling through App. Framework-free by design (Fast refresh: no
// components in this file).
//
// A STACK, not one slot per variant: more than one omnibox of the same variant can
// be mounted at once (the persistent nav field and the mobile sheet's field are
// both `nav`), and a single slot made the second instance's UNMOUNT clear the
// registration the first one still needed — ⌘K then reached nothing. Each
// registration is removed by identity, so the previous one is restored.

export type OmniboxVariant = 'hero' | 'nav' | 'new';

export interface OmniboxHandle {
  /** Move keyboard focus into the field. */
  focus: () => void;
  /** Bring the field into view. Absent for fields that are always on screen. */
  reveal?: () => void;
}

interface Registration {
  variant: OmniboxVariant;
  handle: OmniboxHandle;
}

const stack: Registration[] = [];

/** The most recently mounted omnibox of this variant, if any is mounted. */
function current(variant: OmniboxVariant): OmniboxHandle | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].variant === variant) return stack[i].handle;
  }
  return undefined;
}

/** Focus the hero omnibox (no-op when no hero variant is mounted). */
export function focusHeroOmnibox(): void {
  current('hero')?.focus();
}

/** Scroll the hero omnibox into view and focus it — what a "paste a repo" CTA
 *  further down the page does. No-op when no hero omnibox is mounted. */
export function revealHeroOmnibox(): void {
  const hero = current('hero');
  if (!hero) return;
  hero.reveal?.();
  hero.focus();
}

/** Focus whichever omnibox is mounted — the page's own field first (`new`), then
 *  the hero, then the nav field, which is on every route. */
export function focusOmnibox(): void {
  (current('new') ?? current('hero') ?? current('nav'))?.focus();
}

/** Publish a mounted omnibox; the returned function unregisters exactly this one. */
export function registerOmniboxFocus(variant: OmniboxVariant, handle: OmniboxHandle): () => void {
  const registration: Registration = { variant, handle };
  stack.push(registration);
  return () => {
    const at = stack.indexOf(registration);
    if (at !== -1) stack.splice(at, 1);
  };
}
