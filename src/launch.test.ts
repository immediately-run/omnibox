import { describe, expect, it } from 'vitest';
import type { RecentProject } from '@immediately-run/sdk/recents';
import { PROVIDERS, parseLaunch } from './launch';

// One `it` per row of R3-511's parsing table (FRONT_DOOR_IA §5.2), plus the
// ref-encoding case. The parser is pure — these are the whole contract.

describe('parseLaunch', () => {
  it('parses a GitHub URL (also with trailing /, .git, ?query) as a location with no ref', () => {
    for (const input of [
      'https://github.com/acme/todo',
      'https://github.com/acme/todo/',
      'https://github.com/acme/todo.git',
      'https://github.com/acme/todo?query=1',
    ]) {
      expect(parseLaunch(input)).toMatchObject({
        kind: 'location',
        provider: 'github',
        namespace: 'acme',
        repository: 'todo',
      });
      expect((parseLaunch(input) as { ref?: string }).ref).toBeUndefined();
    }
  });

  it('/tree/<rest>: the ref is the WHOLE remainder (a ref may contain /)', () => {
    expect(parseLaunch('https://github.com/acme/todo/tree/feat/x')).toEqual({
      kind: 'location',
      provider: 'github',
      namespace: 'acme',
      repository: 'todo',
      ref: 'feat/x',
      display: 'github:acme/todo@feat/x',
      presentPath: '/present/github/acme/todo/feat%2Fx',
    });
  });

  it('/blob/<rest>: the ref is the FIRST segment; the file path is dropped (documented limitation)', () => {
    expect(parseLaunch('https://github.com/acme/todo/blob/main/src/App.tsx')).toEqual({
      kind: 'location',
      provider: 'github',
      namespace: 'acme',
      repository: 'todo',
      ref: 'main',
      display: 'github:acme/todo@main',
      presentPath: '/present/github/acme/todo/main',
    });
  });

  it('bare tuples take the default provider; a ref if given', () => {
    expect(parseLaunch('acme/todo')).toMatchObject({
      kind: 'location',
      provider: 'github',
      namespace: 'acme',
      repository: 'todo',
    });
    expect(parseLaunch('acme/todo@dev')).toMatchObject({
      kind: 'location',
      namespace: 'acme',
      repository: 'todo',
      ref: 'dev',
    });
    expect(parseLaunch('acme/todo@feat/x')).toMatchObject({
      kind: 'location',
      repository: 'todo',
      ref: 'feat/x',
    });
  });

  it('a provider prefix names the provider', () => {
    expect(parseLaunch('github:acme/todo@dev')).toMatchObject({
      kind: 'location',
      provider: 'github',
      ref: 'dev',
    });
  });

  it('a platform URL on this host (or any *.immediately.run) passes through with search and hash', () => {
    expect(parseLaunch('https://immediately.run/present/github/a/b/main/x?y=1#z')).toEqual({
      kind: 'platform-url',
      path: '/present/github/a/b/main/x?y=1#z',
    });
    expect(parseLaunch('https://local.immediately.run/edit/github/a/b/main')).toEqual({
      kind: 'platform-url',
      path: '/edit/github/a/b/main',
    });
  });

  it('a known grammar on an unknown provider is a typed rejection', () => {
    expect(parseLaunch('gitlab:acme/todo')).toEqual({ kind: 'unknown-provider', provider: 'gitlab' });
    expect(parseLaunch('https://gitlab.com/acme/todo')).toEqual({
      kind: 'unknown-provider',
      provider: 'gitlab',
    });
  });

  it.each(['acme', 'acme/', '//', 'kanban', ''])('%s is free text', (input) => {
    expect(parseLaunch(input)).toEqual({ kind: 'text', query: input.trim() });
  });

  it('whitespace around any input is trimmed first', () => {
    expect(parseLaunch('  acme/todo  ')).toMatchObject({ kind: 'location', namespace: 'acme' });
    expect(parseLaunch('  ')).toEqual({ kind: 'text', query: '' });
  });

  it('encodes the ref in presentPath exactly once: feat%2Fx', () => {
    const launch = parseLaunch('acme/todo@feat/x');
    expect(launch.kind).toBe('location');
    expect((launch as { presentPath: string }).presentPath).toBe('/present/github/acme/todo/feat%2Fx');
    expect((launch as { presentPath: string }).presentPath).not.toContain('%25');
  });

  it('the present path never carries /files/ or a trailing slash', () => {
    expect((parseLaunch('acme/todo') as { presentPath: string }).presentPath).toBe(
      '/present/github/acme/todo',
    );
  });

  it('the provider table has one row; a second provider is a data change', () => {
    expect(Object.keys(PROVIDERS)).toEqual(['github']);
    expect(PROVIDERS.github).toBe('github.com');
  });

  it('parses the URL a real RecentProject produces — the shape Home will paste (R3-530)', () => {
    // The producer feeds the consumer: the recents record (OUT_OF_SESSION_OBJECTS_SPEC
    // §4.3, the SDK's `RecentProject`) is what the Home app hands to the omnibox, and
    // the URL it yields on GitHub is what a visitor pastes back. Built from the type's
    // own fields, not a hand-typed literal.
    const recent: RecentProject = {
      provider: 'github',
      namespace: 'acme',
      repository: 'todo',
      ref: 'feat/x',
      ts: 1_757_000_000_000,
    };
    const url = `https://github.com/${recent.namespace}/${recent.repository}/tree/${recent.ref}`;
    const parsed = parseLaunch(url) as Extract<ReturnType<typeof parseLaunch>, { kind: 'location' }>;
    expect(parsed.kind).toBe('location');
    expect(parsed.provider).toBe(recent.provider);
    expect(parsed.namespace).toBe(recent.namespace);
    expect(parsed.repository).toBe(recent.repository);
    expect(parsed.ref).toBe(recent.ref);
    expect(parsed.presentPath).toBe(`/present/github/acme/todo/feat%2Fx`);
  });
});
