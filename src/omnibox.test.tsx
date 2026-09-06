// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import Omnibox from './Omnibox';
import type { AppHit, DocHit } from './Omnibox';

afterEach(cleanup);

const outerHref = 'https://immediately.run';

const renderOmnibox = (ui: React.ReactElement) =>
  render(<TinkerableContext value={{ outerHref } as never}>{ui}</TinkerableContext>);

const type = async (query: string) => {
  await userEvent.setup().type(screen.getByRole('combobox'), query);
};

describe('Omnibox with no hit sources (the Home shape, R3-540)', () => {
  it('a location query yields exactly one row — the launch grammar only', async () => {
    renderOmnibox(<Omnibox variant="hero" />);
    await type('github:acme/todo');
    // The location row is a PlatformLink: its href is usePlatformHref's output for
    // the parsed present path — absolute on the host origin, frame-escaping.
    const row = document.getElementById('omnibox-opt-location');
    // useId() ids are colon-prefixed in React 18 and `«»`-shaped in React 19 —
    // match on the stable suffix instead of pinning the prefix.
    const locationRow = screen.getByRole('option', { name: /acme\/todo/ });
    expect(locationRow.id.endsWith('-opt-location')).toBe(true);
    expect(locationRow.getAttribute('href')).toBe(`${outerHref}/present/github/acme/todo`);
    expect(locationRow.getAttribute('target')).toBe('_top');
    void row;
  });

  it('a free-text query with no sources renders the empty line, not a crash', async () => {
    renderOmnibox(<Omnibox variant="hero" />);
    await type('nothing matches this');
    expect(screen.getByText('Nothing matched. Try an app name, or paste a repo.')).toBeTruthy();
  });
});

describe('Omnibox with an injected apps source', () => {
  const source: AppHit[] = [
    { key: 'whiteboard', name: 'Whiteboard', category: 'Creative', blurb: 'canvas', repo: 'whiteboard', path: '/present/github/immediately-run/whiteboard/main/files/src/App.tsx' },
    { key: 'todo-grid', name: 'Todo grid', category: 'Work', blurb: 'tasks', repo: 'todo-grid', path: '/present/github/immediately-run/todo-grid/main/files/src/App.tsx' },
    { key: 'my-todo', name: 'My stuff', category: 'Work', blurb: 'a todo list', repo: 'my-todo', path: '/present/github/immediately-run/my-todo/main/files/src/App.tsx' },
    { key: 'unrelated', name: 'Reader', category: 'Docs', blurb: 'feeds', repo: 'reader', path: '/present/github/immediately-run/reader/main/files/src/App.tsx' },
  ];

  it("ranks, filters and orders the source's candidates (name > repo > blurb; below-threshold dropped)", async () => {
    renderOmnibox(<Omnibox variant="hero" hits={{ apps: () => source }} />);
    await type('todo');
    const rows = screen
      .getAllByRole('option')
      .map((el) => el.querySelector('.omnibox-option-name')?.textContent);
    // `Todo grid` name-prefix (4) > `my-todo` blurb (1); `my-todo`'s repo also
    // matches (2) — the repo rule outranks the blurb. `Whiteboard` and `Reader`
    // score -1 and never render.
    expect(rows).toEqual(['Todo grid', 'My stuff']);
    const openRow = screen.getByRole('option', { name: /Todo grid/ });
    expect(openRow.getAttribute('href')).toBe(`${outerHref}${source[1].path}`);
  });

  it("hands each app row to renderChip (the chip is the site's, not the package's)", async () => {
    const chip = vi.fn((hit: AppHit) => <i>chip:{hit.repo}</i>);
    renderOmnibox(<Omnibox variant="hero" hits={{ apps: () => source }} renderChip={chip} />);
    await type('todo');
    // userEvent types four characters, so the field re-renders per keystroke and
    // the chip renders on every row of every render — assert the FINAL frame's
    // rows and that the chip rendered for the top hit, not a call count.
    expect(screen.getAllByRole('option').map((el) => el.querySelector('.omnibox-option-name')?.textContent)).toEqual([
      'Todo grid',
      'My stuff',
    ]);
    expect(chip.mock.calls.map(([hit]) => hit.repo)).toContain('todo-grid');
    expect(screen.getByText('chip:todo-grid')).toBeTruthy();
  });
});

describe('Omnibox with an injected docs source', () => {
  it("renders the source's rows with their real hrefs", async () => {
    const docs: DocHit[] = [
      { key: 'docs/start--overview', title: 'Overview', lead: 'Start here', href: '/docs/start/overview' },
    ];
    renderOmnibox(<Omnibox variant="hero" hits={{ docs: () => docs }} />);
    await type('overview');
    const row = screen.getByRole('option', { name: /Overview/ });
    expect(row.getAttribute('href')).toBe('/docs/start/overview');
  });

  it("renderDoc renders the row: the consumer's link gets the anchor contract and routes in-app", async () => {
    const docs: DocHit[] = [
      {
        key: 'docs/start--overview',
        title: 'Overview',
        lead: 'Start here',
        href: 'https://immediately.run/docs/start/overview',
        to: '/docs/start/overview',
      },
    ];
    renderOmnibox(
      <Omnibox
        variant="hero"
        hits={{ docs: () => docs }}
        renderDoc={(hit, anchorProps) => (
          // The consumer's in-app link: intercepts plain clicks and routes the app,
          // while href stays real for copy-link / middle-click. Spread the contract.
          <a
            {...anchorProps}
            href={hit.href}
            onClick={(e) => {
              if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) e.preventDefault();
            }}
            data-app-route={hit.to}
          >
            <span className="omnibox-option-name">{hit.title}</span>
            <span className="omnibox-option-blurb">{hit.lead}</span>
          </a>
        )}
      />,
    );
    await type('overview');
    const row = screen.getByRole('option', { name: /Overview/ });
    expect(row.getAttribute('href')).toBe('https://immediately.run/docs/start/overview');
    expect(row.getAttribute('data-app-route')).toBe('/docs/start/overview');
    expect(row.className).toBe('omnibox-option');
    expect(row.id.endsWith('-opt-doc-docs/start--overview')).toBe(true);
  });
});

describe('a throwing hit source degrades, not crashes', () => {
  it('a throwing docs source is logged once and the location row still renders', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing = () => {
      throw new Error('index unavailable');
    };
    renderOmnibox(<Omnibox variant="hero" hits={{ docs: throwing }} />);
    await type('github:acme/todo');
    expect(screen.getByRole('option', { name: /acme\/todo/ })).toBeTruthy();
    // Type again (a second render path through the source): still one warning.
    await type('!');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
