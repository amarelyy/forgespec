import { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../index';
import { CATEGORIES, PartPicture } from './catalog';
import { linkTo } from './router';
import { Icon, LogoMark } from './Sprite';
import { UserMenu } from './UserMenu';
import { Row, useLibraryResults } from './useLibraryResults';
import type { useSearch } from './useSearch';

interface Props {
  search: ReturnType<typeof useSearch>;
  user: User | null;
  onLogin: (reason?: string) => void;
  onSignUp: () => void;
  onLogout: () => void;
}

const SUGGESTIONS = ['LM7805', 'ESP32', 'BME280', 'STM32'];

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const cat = p.get('cat') ?? 'All';
  return { q: p.get('q') ?? '', cat: CATEGORIES.includes(cat) ? cat : 'All' };
}

/** The guest landing spot: a full-page Component Library with real search, a detail pane, and a bottom sheet on phones. */
export function LibraryPage({ search, user, onLogin, onSignUp, onLogout }: Props) {
  const [query, setQuery] = useState(() => readUrl().q);
  const [cat, setCat] = useState(() => readUrl().cat);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { groups, loading, failed, warnings, notFound, summary } = useLibraryResults(search, query, cat);
  const signedIn = !!user;

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current: Row | undefined = flat.find((r) => r.id === selected) ?? (loading ? undefined : flat[0]);

  // Keep the search shareable and the back button meaningful: /library?q=lm7805&cat=Power
  useEffect(() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (cat !== 'All') p.set('cat', cat);
    const qs = p.toString();
    window.history.replaceState(null, '', `/library${qs ? `?${qs}` : ''}`);
  }, [query, cat]);

  // Focus the search on laptops; on phones that would pop the keyboard over the page.
  useEffect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
  }, []);

  // "/" jumps to search, Escape closes the phone sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheetOpen) {
        setSheetOpen(false);
        return;
      }
      if (e.key !== '/' || /input|textarea/i.test(document.activeElement?.tagName ?? '')) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  useEffect(() => {
    if (sheetOpen) closeRef.current?.focus();
  }, [sheetOpen]);

  const choose = (id: string, openSheet: boolean) => {
    setSelected(id);
    if (openSheet) setSheetOpen(true);
    document.getElementById(`lib-item-${id}`)?.scrollIntoView({ block: 'nearest' });
  };

  // Arrow keys walk the result list straight from the search box.
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!flat.length) return;
    const i = current ? flat.findIndex((r) => r.id === current.id) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(i + 1, flat.length - 1) : Math.max(i - 1, 0);
      choose(flat[next]!.id, false);
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      setSheetOpen(true);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
    }
  };

  return (
    <div className="lib">
      <header className="nav">
        <div className="wrap">
          <a className="logo" href="/" onClick={linkTo('/')} aria-label="ForgeSpec home">
            <LogoMark />
            ForgeSpec
          </a>
          <a className="lib-back" href="/" onClick={linkTo('/')}>
            <Icon name="left" size={16} />
            <span>Home</span>
          </a>
          <nav className="nav-cta" aria-label="Account">
            {user ? (
              <UserMenu user={user} onLogout={onLogout} />
            ) : (
              <>
                <button type="button" className="btn btn-text" onClick={() => onLogin()}>
                  Log In
                </button>
                <button type="button" className="btn btn-outline" onClick={onSignUp}>
                  Sign Up
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="wrap lib-main">
        <div className="lib-intro">
          <span className="lib-tag">{signedIn ? 'Signed in' : 'Guest mode'}</span>
          <h1>Component Library</h1>
          <p>Search distributor parts by part number and read the datasheet values. No account needed.</p>
        </div>

        <section className="lib-box" aria-label="Component Library">
          <div className="lib-tools">
            <label className="search lib-search" htmlFor="lib-search">
              <span className="sr-only">Search by manufacturer part number</span>
              <Icon name="search" />
              <input
                id="lib-search"
                ref={inputRef}
                type="search"
                placeholder="Search part number, e.g. LM7805"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-controls="lib-list"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                }}
                onKeyDown={onSearchKey}
              />
              {query ? (
                <button type="button" className="lib-clear" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
                  &times;
                </button>
              ) : (
                <kbd className="lib-kbd">/</kbd>
              )}
            </label>

            <div className="chips lib-chips" aria-label="Filter by category">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" aria-pressed={cat === c} onClick={() => { setCat(c); setSelected(null); }}>
                  {c}
                </button>
              ))}
            </div>

            {!query && (
              <p className="lib-suggest">
                Try:{' '}
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => setQuery(s)}>
                    {s}
                  </button>
                ))}
              </p>
            )}
          </div>

          <div className="lib-body">
            <div className="lib-list" id="lib-list" aria-label="Components" aria-live="polite" aria-busy={loading}>
              {failed && (
                <div className="pitem-note is-error" role="alert">
                  {failed} Showing the sample list instead.
                </div>
              )}
              {warnings.map((w) => (
                <div key={w} className="pitem-note" role="status">
                  {w}
                </div>
              ))}

              {loading && (
                <div className="lib-skeleton" aria-label={`Searching distributors for ${query.trim()}`}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} />
                  ))}
                </div>
              )}

              {!loading &&
                groups.map((g) => (
                  <div key={g.name}>
                    <div className="pgroup">
                      {g.name} <span>{g.items.length}</span>
                    </div>
                    {g.items.map((p) => {
                      const on = current?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          id={`lib-item-${p.id}`}
                          type="button"
                          className={`pitem lib-item${on ? ' is-current' : ''}`}
                          aria-current={on || undefined}
                          onClick={() => choose(p.id, true)}
                        >
                          <PartPicture kind={p.pic} />
                          <span style={{ minWidth: 0 }}>
                            <span className="nm">{p.mpn}</span>
                            <span className="sp">{p.desc}</span>
                          </span>
                          <Icon name="chev" className="chev" />
                        </button>
                      );
                    })}
                  </div>
                ))}

              {!loading && notFound && (
                <div className="pempty">
                  <strong>Component not found</strong>
                  <p>
                    No result for &ldquo;{query.trim()}&rdquo;
                    {cat !== 'All' ? ` in ${cat}` : ''}. You can add the part yourself.
                  </p>
                  <button
                    type="button"
                    className="btn"
                    disabled={signedIn}
                    title={signedIn ? 'The custom part creator arrives with the project workspace' : undefined}
                    onClick={() => onLogin('Log in to create a custom part.')}
                  >
                    Create custom part
                  </button>
                </div>
              )}
            </div>

            {sheetOpen && <button type="button" className="lib-scrim" aria-label="Close details" tabIndex={-1} onClick={() => setSheetOpen(false)} />}
            <aside className={`lib-detail${sheetOpen ? ' is-open' : ''}`} aria-label="Part details">
              {current ? (
                <>
                  <div className="lib-grab" aria-hidden="true" />
                  <div className="lib-detail-head">
                    <PartPicture kind={current.pic} />
                    <div style={{ minWidth: 0 }}>
                      <h2 className="mono">{current.mpn}</h2>
                      <p>{current.desc}</p>
                    </div>
                    <button ref={closeRef} type="button" className="lib-close" aria-label="Close details" onClick={() => setSheetOpen(false)}>
                      &times;
                    </button>
                  </div>
                  <div className="lib-specs">
                    {current.rows.map((r) => (
                      <div key={r.key} className="spec">
                        <span className="k">{r.key}</span>
                        <span className="raw">{r.quoted ? `"${r.raw}"` : r.raw}</span>
                        <span className="val">{r.value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="lib-src">Raw text as listed by the distributor, with the value ForgeSpec parsed from it.</p>
                  {signedIn ? (
                    <p className="lib-src">Saving to a project arrives with the project workspace.</p>
                  ) : (
                    <button type="button" className="btn btn-primary lib-save" onClick={() => onLogin('Log in to save parts to a project.')}>
                      <Icon name="lock" size={16} />
                      Log in to save
                    </button>
                  )}
                </>
              ) : (
                <p className="lib-src lib-none">{loading ? 'Searching…' : 'Pick a part to see its specs.'}</p>
              )}
            </aside>
          </div>

          <div className="dr-foot">
            <span>{summary}</span>
            <span className="lib-hint">
              <kbd>&uarr;</kbd> <kbd>&darr;</kbd> to browse
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
