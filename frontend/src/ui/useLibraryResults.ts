import { useEffect, useMemo } from 'react';
import type { Component } from '../index';
import { CATALOG, CATEGORY_PICTURE, sampleRows } from './catalog';
import type { IconKey, SamplePart, SpecRow } from './catalog';
import { formatSpec, specLabel } from './format';
import type { useSearch } from './useSearch';

/** Chip -> backend category, so the chips also filter live results. */
const CHIP_CATEGORY: Record<string, string> = {
  Microcontrollers: 'mcu', Power: 'power', Sensors: 'sensor', Motors: 'actuator', Passives: 'passive', Connectors: 'connector',
};

export interface Row {
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

/**
 * Shared by the homepage drawer and the library page: searches the distributor after a short pause
 * (2+ characters), and otherwise filters the sample list, which is also the fallback when offline.
 */
export function useLibraryResults(search: ReturnType<typeof useSearch>, query: string, cat: string) {
  const { run, state } = search;

  useEffect(() => {
    const t = setTimeout(() => run(query), 350);
    return () => clearTimeout(t);
  }, [query, run]);

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

  // Live results when we have them, the sample list otherwise.
  const groups = apiRows ? (apiRows.length ? [{ name: `Results for "${query.trim()}"`, items: apiRows }] : []) : local;
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const notFound = !loading && count === 0;
  const summary = loading
    ? 'Searching…'
    : apiRows
      ? `${count} result${count === 1 ? '' : 's'} from ${apiDone?.provider === 'mock' ? 'the sample catalogue' : 'distributors'}`
      : `${count} part${count === 1 ? '' : 's'} in this sample`;

  return { groups, count, loading, failed, warnings: apiDone?.warnings ?? [], notFound, summary };
}
