import { describe, expect, it, vi } from 'vitest';
import {
  focusHeroOmnibox,
  focusOmnibox,
  registerOmniboxFocus,
  revealHeroOmnibox,
} from './omniboxFocus';

// The registry is a module singleton that several components write to on mount.
// The defect these tests exist for: the mobile sheet's omnibox and the /new
// omnibox each mounted a SECOND registration, and their unmount cleanup cleared
// the slot the persistent nav field still owned — so ⌘K stopped working after
// closing the sheet. Every case below unregisters what it registers, so the
// shared module state does not leak between them.

const handle = () => {
  const focus = vi.fn();
  const reveal = vi.fn();
  return { focus, reveal, handle: { focus, reveal } };
};

describe('registerOmniboxFocus', () => {
  it('focuses the nav field when only the nav omnibox is mounted', () => {
    const nav = handle();
    const off = registerOmniboxFocus('nav', nav.handle);
    focusOmnibox();
    expect(nav.focus).toHaveBeenCalledTimes(1);
    off();
  });

  it('restores the first registration when a SECOND instance of the same variant unmounts', () => {
    // The mobile sheet: the persistent nav field is already registered, the
    // sheet mounts a second `nav` omnibox, then the sheet closes.
    const persistent = handle();
    const sheet = handle();
    const offPersistent = registerOmniboxFocus('nav', persistent.handle);
    const offSheet = registerOmniboxFocus('nav', sheet.handle);

    focusOmnibox();
    expect(sheet.focus).toHaveBeenCalledTimes(1);
    expect(persistent.focus).not.toHaveBeenCalled();

    offSheet();
    focusOmnibox();
    expect(persistent.focus).toHaveBeenCalledTimes(1);
    expect(sheet.focus).toHaveBeenCalledTimes(1);

    offPersistent();
  });

  it('leaves the nav field reachable after the /new omnibox unmounts', () => {
    // `/new` mounts its own variant beside the nav field; navigating away
    // unmounts it and must not take the nav registration with it.
    const nav = handle();
    const neu = handle();
    const offNav = registerOmniboxFocus('nav', nav.handle);
    const offNew = registerOmniboxFocus('new', neu.handle);

    focusOmnibox();
    expect(neu.focus).toHaveBeenCalledTimes(1);

    offNew();
    focusOmnibox();
    expect(nav.focus).toHaveBeenCalledTimes(1);

    offNav();
  });

  it('prefers the hero omnibox over the nav field, and `new` over both', () => {
    const nav = handle();
    const hero = handle();
    const neu = handle();
    const offNav = registerOmniboxFocus('nav', nav.handle);
    const offHero = registerOmniboxFocus('hero', hero.handle);

    focusOmnibox();
    expect(hero.focus).toHaveBeenCalledTimes(1);
    expect(nav.focus).not.toHaveBeenCalled();

    const offNew = registerOmniboxFocus('new', neu.handle);
    focusOmnibox();
    expect(neu.focus).toHaveBeenCalledTimes(1);
    expect(hero.focus).toHaveBeenCalledTimes(1);

    offNew();
    offHero();
    focusOmnibox();
    expect(nav.focus).toHaveBeenCalledTimes(1);
    offNav();
  });

  it('unregisters by identity, so a stale cleanup cannot clear a live registration', () => {
    const first = handle();
    const second = handle();
    const offFirst = registerOmniboxFocus('hero', first.handle);
    offFirst();
    const offSecond = registerOmniboxFocus('hero', second.handle);
    offFirst(); // the unmounted instance's cleanup, run again
    focusHeroOmnibox();
    expect(second.focus).toHaveBeenCalledTimes(1);
    offSecond();
  });

  it('does nothing when no omnibox is mounted', () => {
    expect(() => focusOmnibox()).not.toThrow();
    expect(() => focusHeroOmnibox()).not.toThrow();
    expect(() => revealHeroOmnibox()).not.toThrow();
  });
});

describe('revealHeroOmnibox', () => {
  it('scrolls the hero field into view and then focuses it', () => {
    const calls: string[] = [];
    const off = registerOmniboxFocus('hero', {
      focus: () => calls.push('focus'),
      reveal: () => calls.push('reveal'),
    });
    revealHeroOmnibox();
    expect(calls).toEqual(['reveal', 'focus']);
    off();
  });

  it('reaches only the hero — the nav field is never scrolled to', () => {
    const nav = handle();
    const off = registerOmniboxFocus('nav', nav.handle);
    revealHeroOmnibox();
    expect(nav.reveal).not.toHaveBeenCalled();
    expect(nav.focus).not.toHaveBeenCalled();
    off();
  });

  it('still focuses a hero registered without a `reveal`', () => {
    const focus = vi.fn();
    const off = registerOmniboxFocus('hero', { focus });
    revealHeroOmnibox();
    expect(focus).toHaveBeenCalledTimes(1);
    off();
  });
});
