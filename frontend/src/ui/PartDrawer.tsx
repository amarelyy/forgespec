import { RefObject, useEffect, useRef, useState } from 'react';
import { CATEGORIES, PartPicture } from './catalog';
import { Icon } from './Sprite';
import { useLibraryResults } from './useLibraryResults';
import type { useSearch } from './useSearch';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  search: ReturnType<typeof useSearch>;
  signedIn: boolean;
  /** Guests are sent to sign in for anything that writes. */
  onNeedLogin: (reason: string) => void;
  /** Fills the search box from outside (the "Try" part numbers); `n` changes on every request. */
  request?: { q: string; n: number };
}

const SCROLL_PX_PER_S = 24;

/**
 * Slowly scrolls the sample list by itself, so visitors see how many parts there are without touching it.
 * At the bottom it waits, glides back to the top, and starts again. It stops while the pointer or focus is inside,
 * for a few seconds after a touch or wheel, while the list is off screen, and when motion is reduced.
 */
function useAutoScroll(listRef: RefObject<HTMLElement | null>, rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const list = listRef.current;
    const root = rootRef.current;
    if (!enabled || !list || !root || typeof IntersectionObserver === 'undefined') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let last = 0;
    let pos = list.scrollTop;
    let visible = false;
    let inside = false;
    let holdUntil = performance.now() + 1200;
    let rewind = false;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(64, t - last) : 0;
      last = t;
      if (!visible || inside || t < holdUntil) {
        pos = list.scrollTop; // pick up wherever the visitor left it
        return;
      }
      if (rewind) {
        rewind = false;
        list.scrollTo({ top: 0, behavior: 'smooth' });
        holdUntil = t + 1800;
        return;
      }
      const max = list.scrollHeight - list.clientHeight;
      if (max <= 1) return;
      if (pos >= max - 1) {
        rewind = true;
        holdUntil = t + 1600;
        return;
      }
      pos = Math.min(max, pos + (SCROLL_PX_PER_S * dt) / 1000);
      list.scrollTop = pos;
    };

    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting), { threshold: 0.3 });
    io.observe(list);
    const enter = (e: PointerEvent) => e.pointerType === 'mouse' && (inside = true);
    const leave = () => {
      inside = false;
      holdUntil = performance.now() + 1500;
    };
    const focusIn = () => (inside = true);
    const focusOut = (e: FocusEvent) => !root.contains(e.relatedTarget as Node | null) && leave();
    const nudge = () => (holdUntil = performance.now() + 4000); // the visitor scrolled it themselves
    root.addEventListener('pointerenter', enter);
    root.addEventListener('pointerleave', leave);
    root.addEventListener('focusin', focusIn);
    root.addEventListener('focusout', focusOut);
    list.addEventListener('wheel', nudge, { passive: true });
    list.addEventListener('touchstart', nudge, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      root.removeEventListener('pointerenter', enter);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('focusin', focusIn);
      root.removeEventListener('focusout', focusOut);
      list.removeEventListener('wheel', nudge);
      list.removeEventListener('touchstart', nudge);
    };
  }, [listRef, rootRef, enabled]);
}

export function PartDrawer({ inputRef, search, signedIn, onNeedLogin, request }: Props) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [open, setOpen] = useState<string | null>(null);
  const { groups, loading, failed, warnings, notFound, summary } = useLibraryResults(search, query, cat);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!request) return;
    setQuery(request.q);
    setCat('All');
    setOpen(null);
  }, [request]);
  // Only the untouched sample list scrolls itself: not while searching or reading a part.
  useAutoScroll(listRef, rootRef, !query.trim() && open === null);

  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  return (
    <div className="drawer" aria-label="Component Library" ref={rootRef}>
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

      <div className="plist" id="plist" ref={listRef} aria-label="Components" aria-live="polite" aria-busy={loading}>
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
                            <button type="button" onClick={() => onNeedLogin('Sign in to save parts to a project.')}>
                              <Icon name="lock" size={14} />
                              Sign in to save
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
              onClick={() => onNeedLogin('Sign in to create a custom part.')}
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
