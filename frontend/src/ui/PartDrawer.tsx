import { RefObject, useEffect, useState } from 'react';
import { CATEGORIES, PartPicture } from './catalog';
import { Icon } from './Sprite';
import { useLibraryResults } from './useLibraryResults';
import type { useSearch } from './useSearch';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  search: ReturnType<typeof useSearch>;
  signedIn: boolean;
  /** Guests are sent to log in for anything that writes. */
  onNeedLogin: (reason: string) => void;
}

export function PartDrawer({ inputRef, search, signedIn, onNeedLogin }: Props) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [open, setOpen] = useState<string | null>('BME280');
  const { groups, loading, failed, warnings, notFound, summary } = useLibraryResults(search, query, cat);

  // "/" jumps to the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || /input|textarea/i.test(document.activeElement?.tagName ?? '')) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inputRef]);

  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  return (
    <div className="drawer" aria-label="Component Library">
      <div className="dr-head">
        <b>Component Library</b>
        <span className="tag">{signedIn ? 'Signed in' : 'Guest'}</span>
      </div>

      <label className="search" htmlFor="part-search">
        <span className="sr-only">Search by manufacturer part number</span>
        <Icon name="search" />
        <input
          id="part-search"
          ref={inputRef}
          type="search"
          placeholder="Search part number, e.g. LM7805"
          autoComplete="off"
          spellCheck={false}
          aria-controls="plist"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(null);
          }}
        />
      </label>

      <div className="chips" aria-label="Filter by category">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="plist" id="plist" aria-label="Components" aria-live="polite" aria-busy={loading}>
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
          <div className="pload" aria-label={`Searching distributors for ${query.trim()}`}>
            <span />
            <span />
            <span />
          </div>
        )}

        {!loading &&
          groups.map((g) => (
            <div key={g.name}>
              <div className="pgroup">
                {g.name} <span>{g.items.length}</span>
              </div>
              {g.items.map((p) => {
                const isOpen = open === p.id;
                return (
                  <div key={p.id}>
                    <button type="button" className="pitem" aria-expanded={isOpen} onClick={() => toggle(p.id)}>
                      <PartPicture kind={p.pic} />
                      <span style={{ minWidth: 0 }}>
                        <span className="nm">{p.mpn}</span>
                        <span className="sp">{p.desc}</span>
                      </span>
                      <Icon name="chev" className="chev" />
                    </button>
                    {isOpen && (
                      <div className="pdetail">
                        {p.rows.map((r) => (
                          <div key={r.key} className="spec">
                            <span className="k">{r.key}</span>
                            <span className="raw">{r.quoted ? `"${r.raw}"` : r.raw}</span>
                            <span className="val">{r.value}</span>
                          </div>
                        ))}
                        <div className="save">
                          <span>Read from the distributor listing</span>
                          {signedIn ? (
                            <span>Project workspace is the next build step</span>
                          ) : (
                            <button type="button" onClick={() => onNeedLogin('Log in to save parts to a project.')}>
                              <Icon name="lock" size={14} />
                              Log in to save
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
              onClick={() => onNeedLogin('Log in to create a custom part.')}
            >
              Create custom part
            </button>
          </div>
        )}
      </div>

      <div className="dr-foot">
        <span>{summary}</span>
        <span>Specs from distributor APIs</span>
      </div>
    </div>
  );
}
