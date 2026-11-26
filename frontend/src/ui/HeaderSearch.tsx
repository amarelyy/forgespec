import { KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import type { ForgeSpecApi } from '../index';
import { PartPicture } from './catalog';
import { Icon } from './Sprite';
import { useLibraryResults } from './useLibraryResults';
import { useSearch } from './useSearch';

interface Props {
  api: Pick<ForgeSpecApi, 'library'>;
  signedIn: boolean;
  /** Guests are sent to sign in for anything that writes. */
  onNeedLogin: (reason: string) => void;
  /** Scrolls to the Component Library section. */
  onLibrary: () => void;
}

const MAX = 6;

/**
 * Part search in the header. Results drop down under the field: the sample catalogue while the box is empty or holds
 * one letter, live distributor results from two letters on. A result opens in place to show its specs.
 * Press "/" anywhere on the page to jump here. On narrow screens the field hides behind a search button.
 */
export function HeaderSearch({ api, signedIn, onNeedLogin, onLibrary }: Props) {
  const search = useSearch(api);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { groups, loading, failed, notFound, summary } = useLibraryResults(search, query, 'All');
  const items = groups.flatMap((g) => g.items).slice(0, MAX);
  const typed = query.trim();

  const close = (refocus = false) => {
    setOpen(false);
    setRevealed(false);
    if (refocus) inputRef.current?.focus();
  };

  // "/" focuses the search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || /input|textarea|select/i.test(document.activeElement?.tagName ?? '')) return;
      e.preventDefault();
      setRevealed(true);
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // A click outside closes the results.
  useEffect(() => {
    if (!open && !revealed) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, revealed]);

  const results = () => Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('.hs-item') ?? []);

  const onFieldKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (open) setOpen(false);
      else close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => results()[0]?.focus());
    }
  };

  // Arrow keys walk the results; Escape goes back to the field.
  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = results();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) inputRef.current?.focus();
    else list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };

  const heading = loading
    ? `Searching distributors for “${typed}”`
    : typed.length >= 2 && !failed
      ? summary
      : typed
        ? `Sample parts matching “${typed}”`
        : 'Sample parts. Type a part number to search distributors.';

  return (
    <div className={`hs${revealed ? ' is-revealed' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="hs-toggle"
        aria-label="Search parts"
        aria-expanded={revealed}
        onClick={() => {
          setRevealed((r) => !r);
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <Icon name="search" />
      </button>

      <div className="hs-field">
        <Icon name="search" />
        <label className="sr-only" htmlFor="header-search">
          Search parts by part number
        </label>
        <input
          id="header-search"
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="hs-panel"
          aria-haspopup="dialog"
          aria-autocomplete="list"
          placeholder="Search parts, e.g. BME280"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setDetail(null);
            setOpen(true);
          }}
          onKeyDown={onFieldKey}
        />
        <kbd aria-hidden="true">/</kbd>
      </div>

      {open && (
        <div className="hs-panel" id="hs-panel" role="dialog" aria-label="Part results" ref={panelRef} onKeyDown={onPanelKey}>
          <p className="hs-head" aria-live="polite">
            {heading}
          </p>
          {failed && (
            <p className="hs-note" role="alert">
              {failed} Showing sample parts instead.
            </p>
          )}

          {loading ? (
            <div className="pload" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ) : notFound ? (
            <div className="hs-empty">
              <strong>No part matches “{typed}”.</strong>
              <p>You can add it yourself as a custom part.</p>
              <button
                type="button"
                className="btn"
                disabled={signedIn}
                title={signedIn ? 'The custom part creator arrives with the project workspace' : undefined}
                onClick={() => (close(), onNeedLogin('Sign in to create a custom part.'))}
              >
                Create custom part
              </button>
            </div>
          ) : (
            <ul className="hs-list">
              {items.map((p) => {
                const isOpen = detail === p.id;
                return (
                  <li key={p.id}>
                    <button type="button" className="hs-item" aria-expanded={isOpen} onClick={() => setDetail(isOpen ? null : p.id)}>
                      <PartPicture kind={p.pic} />
                      <span className="hs-name">
                        <span className="nm">{p.mpn}</span>
                        <span className="sp">{p.desc}</span>
                      </span>
                      <Icon name="chev" className="chev" />
                    </button>
                    {isOpen && (
                      <div className="hs-detail">
                        {p.rows.map((r) => (
                          <div key={r.key} className="spec">
                            <span className="k">{r.key}</span>
                            <span className="raw">{r.quoted ? `"${r.raw}"` : r.raw}</span>
                            <span className="val">{r.value}</span>
                          </div>
                        ))}
                        {!signedIn && (
                          <button type="button" className="hs-save" onClick={() => (close(), onNeedLogin('Sign in to save parts to a project.'))}>
                            <Icon name="lock" size={14} />
                            Sign in to save
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <button type="button" className="hs-all" onClick={() => (close(), onLibrary())}>
            Open the Component Library
            <Icon name="right" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
