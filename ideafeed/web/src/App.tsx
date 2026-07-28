import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Feed, FeedItem, SortKey, View } from './types';
import { Card } from './components/Card';
import { CommandK, SkFeed, ToastProvider, useToast, type Command } from './components/primitives';
import { downloadJson, readTheme, store, writeTheme, type StoreState, type Theme } from './lib/store';
import { relative } from './lib/format';

const FEED_URL = `${import.meta.env.BASE_URL}feed.json`;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Most interesting' },
  { key: 'newest', label: 'Newest find' },
  { key: 'momentum', label: 'Fastest moving' },
  { key: 'stars', label: 'Most stars' },
];

const VIEWS: { key: View; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'saved', label: 'Saved' },
  { key: 'archive', label: 'Archive' },
];

function App() {
  const toast = useToast();

  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<StoreState | null>(null);
  /** The visit timestamp from *before* this session — drives the "new" pills. */
  const previousVisit = useRef<string | null>(null);

  const [view, setView] = useState<View>('feed');
  const [sort, setSort] = useState<SortKey>('score');
  const [lane, setLane] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');

  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  /* ------------------------------- data ------------------------------- */

  const loadFeed = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`feed.json returned ${res.status}`);
      const data: Feed = await res.json();
      if (!Array.isArray(data.items)) throw new Error('feed.json has no items');
      setFeed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the feed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    setTheme(readTheme());
    void store.load().then((loaded) => {
      previousVisit.current = loaded.lastVisit;
      setState({ ...loaded, lastVisit: new Date().toISOString() });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    void store.save(state);
  }, [state]);

  useEffect(() => {
    writeTheme(theme);
  }, [theme]);

  /* ------------------------------ derived ------------------------------ */

  const bookmarks = useMemo(() => new Set(state?.bookmarks ?? []), [state]);
  const archived = useMemo(() => new Set(state?.dismissed ?? []), [state]);
  const opened = useMemo(() => new Set(state?.opened ?? []), [state]);

  const isNew = useCallback(
    (item: FeedItem) =>
      Boolean(previousVisit.current) &&
      new Date(item.first_seen).getTime() > new Date(previousVisit.current!).getTime(),
    [],
  );

  const lanes = feed?.lanes ?? [];

  const visible = useMemo(() => {
    const all = feed?.items ?? [];
    const needle = query.trim().toLowerCase();

    let list = all.filter((item) => {
      if (view === 'saved') return bookmarks.has(item.id);
      if (view === 'archive') return archived.has(item.id);
      return !archived.has(item.id);
    });

    if (lane !== 'all') list = list.filter((item) => item.lanes.includes(lane));

    if (needle) {
      list = list.filter((item) =>
        [
          item.full_name,
          item.hook,
          item.why ?? '',
          item.language ?? '',
          item.tags.join(' '),
          item.topics.join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'newest':
          return new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime();
        case 'momentum':
          return b.star_velocity - a.star_velocity;
        case 'stars':
          return b.stars - a.stars;
        default:
          return b.score - a.score;
      }
    });
    return sorted;
  }, [feed, view, lane, query, sort, bookmarks, archived]);

  const newCount = useMemo(
    () => (feed?.items ?? []).filter((item) => isNew(item) && !archived.has(item.id)).length,
    [feed, isNew, archived],
  );

  useEffect(() => {
    setSelected(0);
  }, [view, lane, sort, query]);

  /* ------------------------------ actions ------------------------------ */

  const toggleIn = (key: 'bookmarks' | 'dismissed' | 'opened', id: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const list = prev[key];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...prev, [key]: next };
    });
  };

  const toggleBookmark = (item: FeedItem) => {
    toggleIn('bookmarks', item.id);
    toast(bookmarks.has(item.id) ? 'Removed from saved' : `Saved ${item.name}`);
  };

  const toggleArchive = (item: FeedItem) => {
    toggleIn('dismissed', item.id);
    toast(archived.has(item.id) ? `Restored ${item.name}` : `Archived ${item.name}`);
  };

  const markOpened = (item: FeedItem) => {
    setState((prev) =>
      prev && !prev.opened.includes(item.id)
        ? { ...prev, opened: [...prev.opened, item.id] }
        : prev,
    );
  };

  const openSelected = () => {
    const item = visible[selected];
    if (!item) return;
    markOpened(item);
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  const exportSaved = () => {
    const saved = (feed?.items ?? []).filter((item) => bookmarks.has(item.id));
    if (!saved.length) {
      toast('Nothing saved yet', { err: true });
      return;
    }
    downloadJson(`ideafeed-saved-${new Date().toISOString().slice(0, 10)}.json`, saved);
    toast(`Exported ${saved.length} saved ${saved.length === 1 ? 'item' : 'items'}`);
  };

  /* ----------------------------- keyboard ----------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (typing) {
        if (e.key === 'Escape') (target as HTMLInputElement).blur();
        return;
      }
      if (paletteOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          setSelected((i) => Math.min(i + 1, visible.length - 1));
          break;
        case 'k':
          e.preventDefault();
          setSelected((i) => Math.max(i - 1, 0));
          break;
        case 'o':
        case 'Enter':
          e.preventDefault();
          openSelected();
          break;
        case 'b':
          e.preventDefault();
          if (visible[selected]) toggleBookmark(visible[selected]);
          break;
        case 'x':
          e.preventDefault();
          if (visible[selected]) toggleArchive(visible[selected]);
          break;
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case '1':
          setView('feed');
          break;
        case '2':
          setView('saved');
          break;
        case '3':
          setView('archive');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    cardRefs.current[selected]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  /* ---------------------------- command palette ---------------------------- */

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      ...VIEWS.map((v) => ({
        id: `view-${v.key}`,
        label: `Go to ${v.label}`,
        keywords: [v.key],
        run: () => setView(v.key),
      })),
      ...SORTS.map((s) => ({
        id: `sort-${s.key}`,
        label: `Sort by ${s.label.toLowerCase()}`,
        keywords: ['sort', s.key],
        run: () => setSort(s.key),
      })),
      {
        id: 'lane-all',
        label: 'Show all lanes',
        keywords: ['filter', 'lane', 'reset'],
        run: () => setLane('all'),
      },
      ...lanes.map((l) => ({
        id: `lane-${l.id}`,
        label: `Filter to ${l.label}`,
        keywords: ['lane', 'filter', l.label.toLowerCase()],
        run: () => setLane(l.id),
      })),
      {
        id: 'refresh',
        label: 'Refresh feed',
        keywords: ['reload', 'fetch'],
        run: () => void loadFeed({ silent: true }).then(() => toast('Feed refreshed')),
      },
      {
        id: 'export',
        label: 'Export saved items as JSON',
        keywords: ['download', 'backup', 'bookmarks'],
        run: exportSaved,
      },
      {
        id: 'theme',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        keywords: ['theme', 'dark', 'light', 'appearance'],
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
    ];
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, theme, feed, bookmarks]);

  /* ------------------------------- render ------------------------------- */

  cardRefs.current = [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <h1>ideafeed</h1>
              <p className="sub">
                {feed
                  ? `${feed.stats.total} projects · updated ${relative(feed.generated_at)}`
                  : 'Scanning GitHub for things worth a second look'}
              </p>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="search">
              <SearchIcon />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the feed…"
                aria-label="Search the feed"
              />
              {query && (
                <button className="clear" onClick={() => setQuery('')} aria-label="Clear search">
                  ×
                </button>
              )}
            </div>
            <button
              className="btn ghost icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              <ThemeIcon theme={theme} />
            </button>
            <button className="btn ghost kbd-hint" onClick={() => setPaletteOpen(true)}>
              <kbd>⌘K</kbd>
            </button>
          </div>
        </div>

        <div className="controls">
          <div className="seg" role="tablist" aria-label="View">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                className={view === v.key ? 'on' : ''}
                onClick={() => setView(v.key)}
              >
                {v.label}
                {v.key === 'saved' && bookmarks.size > 0 && (
                  <span className="count">{bookmarks.size}</span>
                )}
              </button>
            ))}
          </div>

          <div className="spacer" />

          <label className="sort">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {lanes.length > 0 && (
          <div className="lanes" role="group" aria-label="Filter by lane">
            <button className={`chip${lane === 'all' ? ' on' : ''}`} onClick={() => setLane('all')}>
              All
            </button>
            {lanes.map((l) => (
              <button
                key={l.id}
                className={`chip${lane === l.id ? ' on' : ''}`}
                onClick={() => setLane(lane === l.id ? 'all' : l.id)}
                title={l.blurb}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="main">
        {newCount > 0 && view === 'feed' && (
          <div className="banner pagefade">
            <span className="banner-dot" />
            {newCount} new since your last visit
            <button className="btn ghost tiny" onClick={() => setSort('newest')}>
              Show newest first
            </button>
          </div>
        )}

        {loading && <SkFeed />}

        {!loading && error && (
          <div className="state pagefade">
            <h2>The feed didn’t load</h2>
            <p>{error}</p>
            <p className="dim">
              If this is a fresh checkout, the scanner hasn’t written{' '}
              <code>public/feed.json</code> yet.
            </p>
            <button className="btn primary" onClick={() => void loadFeed()}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            view={view}
            query={query}
            lane={lane}
            onReset={() => {
              setQuery('');
              setLane('all');
            }}
            onGoFeed={() => setView('feed')}
          />
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="pagefade" key={`${view}-${lane}-${sort}`}>
            <div className="feed stagger">
              {visible.map((item, i) => (
                <Card
                  key={item.id}
                  item={item}
                  isNew={isNew(item)}
                  bookmarked={bookmarks.has(item.id)}
                  archived={archived.has(item.id)}
                  opened={opened.has(item.id)}
                  selected={i === selected}
                  onBookmark={() => toggleBookmark(item)}
                  onArchive={() => toggleArchive(item)}
                  onOpen={() => markOpened(item)}
                  cardRef={(el) => {
                    cardRefs.current[i] = el;
                  }}
                />
              ))}
            </div>
            <p className="footnote">
              {visible.length} shown · scanned every few hours ·{' '}
              <button className="linklike" onClick={exportSaved}>
                export saved
              </button>
            </p>
          </div>
        )}
      </main>

      <div className="keyhints" aria-hidden="true">
        <kbd>j</kbd>
        <kbd>k</kbd> move · <kbd>o</kbd> open · <kbd>b</kbd> save · <kbd>x</kbd> archive ·{' '}
        <kbd>/</kbd> search
      </div>

      <CommandK commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  // Shows what you'll get, not what you have.
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <circle cx="8" cy="8" r="3.1" fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="8"
            y1="1.4"
            x2="8"
            y2="3.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            transform={`rotate(${deg} 8 8)`}
          />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M13.2 10.1A5.6 5.6 0 0 1 6 2.8a5.7 5.7 0 1 0 7.2 7.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EmptyState({
  view,
  query,
  lane,
  onReset,
  onGoFeed,
}: {
  view: View;
  query: string;
  lane: string;
  onReset: () => void;
  onGoFeed: () => void;
}) {
  if (query || lane !== 'all') {
    return (
      <div className="state pagefade">
        <h2>Nothing matches that</h2>
        <p>
          No projects match{query ? ` “${query}”` : ''}
          {lane !== 'all' ? ` in ${lane}` : ''}.
        </p>
        <button className="btn primary" onClick={onReset}>
          Clear filters
        </button>
      </div>
    );
  }

  if (view === 'saved') {
    return (
      <div className="state pagefade">
        <h2>Nothing saved yet</h2>
        <p>
          Press <kbd>b</kbd> on anything in the feed to keep it here for later.
        </p>
        <button className="btn primary" onClick={onGoFeed}>
          Back to the feed
        </button>
      </div>
    );
  }

  if (view === 'archive') {
    return (
      <div className="state pagefade">
        <h2>Archive is empty</h2>
        <p>
          Press <kbd>x</kbd> on anything you don’t want to see again. It lands here, not in
          the bin.
        </p>
        <button className="btn primary" onClick={onGoFeed}>
          Back to the feed
        </button>
      </div>
    );
  }

  return (
    <div className="state pagefade">
      <h2>The feed is empty</h2>
      <p>
        The scanner hasn’t found anything yet. It runs every couple of hours — or run{' '}
        <code>npm run scan</code> in <code>ideafeed/scanner</code> to fill it now.
      </p>
    </div>
  );
}

export default function Root() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
