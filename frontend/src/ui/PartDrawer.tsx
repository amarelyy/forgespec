import { RefObject, useEffect, useMemo, useState } from 'react';
import type { Component } from '../index';
import { CATALOG, CATEGORIES, CATEGORY_PICTURE, PartPicture, sampleRows } from './catalog';
import type { IconKey, SamplePart, SpecRow } from './catalog';
import { CATEGORY_LABEL, formatSpec, specLabel } from './format';
import { Icon } from './Sprite';
import type { useSearch } from './useSearch';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  search: ReturnType<typeof useSearch>;
  signedIn: boolean;
  /** Guests are sent to log in for anything that writes. */
  onNeedLogin: (reason: string) => void;
}

/** Chip -> backend category, so the chips also filter live results. */
const CHIP_CATEGORY: Record<string, string> = {
  Microcontrollers: 'mcu', Power: 'power', Sensors: 'sensor', Motors: 'actuator', Passives: 'passive', Connectors: 'connector',
};

interface Row {
  id: string;
  mpn: string;
  desc: string;
  pic: IconKey;
  rows: SpecRow[];
}

const fromSample = (p: SamplePart): Row => ({ id: p.mpn, mpn: p.mpn, desc: p.d, pic: p.ic, rows: sampleRows(p) });

function fromApi(c: Component): Row {
  const rows: SpecRow[] = Object.entries(c.specs).map(([key, s]) => ({ key: specLabel(key), raw: s.raw, value: formatSpec(s), quoted: true }));
  if (c.package_type) rows.push({ key: 'Package', raw: c.package_type, value: '', quoted: false });
  if (c.price !== null) rows.push({ key: 'Price', raw: 'unit, qty 1', value: `$${c.price.toFixed(2)}`, quoted: false });
  return { id: c.id, mpn: c.mpn, desc: c.name, pic: CATEGORY_PICTURE[c.category] ?? 'mcu', rows };
}

export function PartDrawer({ inputRef, search, signedIn, onNeedLogin }: Props) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [open, setOpen] = useState<string | null>('BME280');
  const { run, state } = search;

  // Search the distributor after a short pause. Shorter than 2 characters just filters the sample list.
  useEffect(() => {
    const t = setTimeout(() => run(query), 350);
    return () => clearTimeout(t);
  }, [query, run]);

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

  const text = query.trim().toLowerCase();
  const live = text.length >= 2;

  const local = useMemo(() => {
    const groups: { name: string; items: Row[] }[] = [];
    for (const [name, parts] of CATALOG) {
      if (cat !== 'All' && name !== cat) continue;
      const hits = parts.filter((p) => !text || `${p.mpn} ${p.d} ${p.kw} ${name}`.toLowerCase().includes(text));
      if (hits.length) groups.push({ name, items: hits.map(fromSample) });
    }
    return groups;
  }, [cat, text]);

  // Only trust a search state that belongs to what is typed now (the search is debounced).
  const fresh = live && state.status !== 'idle' && state.query === query.trim();
  const apiDone = fresh && state.status === 'done' ? state.result : null;
  const apiRows = apiDone ? apiDone.results.filter((c) => cat === 'All' || c.category === CHIP_CATEGORY[cat]).map(fromApi) : null;
  const failed = fresh && state.status === 'error' ? state.message : null;
  const loading = live && !apiDone && !failed;

  // Which list to show: live results when we have them, the sample list otherwise (also the fallback when offline).
  const groups = apiRows ? (apiRows.length ? [{ name: `Results for "${query.trim()}"`, items: apiRows }] : []) : local;
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const notFound = !loading && count === 0;

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
        {apiDone?.warnings.map((w) => (
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
        <span>
          {loading ? 'Searching…' : apiRows ? `${count} result${count === 1 ? '' : 's'} from ${apiDone?.provider === 'mock' ? 'the sample catalogue' : 'distributors'}` : `${count} part${count === 1 ? '' : 's'} in this sample`}
        </span>
        <span>Specs from distributor APIs</span>
      </div>
    </div>
  );
}
