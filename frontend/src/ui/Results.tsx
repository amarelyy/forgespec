import { useState } from 'react';
import type { Component } from '../index';
import { ChevronIcon } from './icons';
import { CATEGORY_LABEL, formatSpec, keySpecs, specLabel } from './format';
import type { SearchState } from './useSearch';

interface Props {
  state: SearchState;
  signedIn: boolean;
  /** Guests are sent to log in for anything that writes (US-01). */
  onNeedLogin: (reason: string) => void;
}

export function Results({ state, signedIn, onNeedLogin }: Props) {
  if (state.status === 'idle') return <div aria-live="polite" className="sr-only" />;

  if (state.status === 'loading') {
    return (
      <section className="results" aria-live="polite" aria-busy="true">
        <p className="results__status">Searching distributors for &ldquo;{state.query}&rdquo;&hellip;</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="results">
        <div className="notice notice--error" role="alert">
          {state.message}
        </div>
      </section>
    );
  }

  const { result, query } = state;
  return (
    <section className="results" aria-label="Search results">
      <p className="results__status" aria-live="polite">
        {result.total === 0
          ? `No results for "${query}"`
          : `${result.total} result${result.total === 1 ? '' : 's'} for "${query}"`}
        {result.provider === 'mock' && <span className="tag tag--muted">Sample catalogue</span>}
      </p>

      {result.warnings.map((w) => (
        <div key={w} className="notice notice--warning" role="status">
          {w}
        </div>
      ))}

      {result.not_found && (
        <div className="empty">
          <h3>Component not found</h3>
          <p>Check the manufacturer part number, or define the part yourself with its specifications.</p>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => (signedIn ? undefined : onNeedLogin('Log in to create a custom part.'))}
            disabled={signedIn}
            title={signedIn ? 'The custom part creator arrives with the project workspace' : undefined}
          >
            Create a custom part
          </button>
        </div>
      )}

      <ul className="parts">
        {result.results.map((c) => (
          <PartRow key={c.id} part={c} signedIn={signedIn} onNeedLogin={onNeedLogin} />
        ))}
      </ul>
    </section>
  );
}

function PartRow({ part, signedIn, onNeedLogin }: { part: Component; signedIn: boolean; onNeedLogin: Props['onNeedLogin'] }) {
  const [open, setOpen] = useState(false);
  const specs = keySpecs(part);
  const detailId = `detail-${part.id}`;

  return (
    <li className="part">
      <div className="part__head">
        <div className="part__title">
          <h3 className="part__mpn">{part.mpn}</h3>
          <p className="part__meta">
            {[part.manufacturer, CATEGORY_LABEL[part.category] ?? part.category, part.package_type].filter(Boolean).join('  /  ')}
          </p>
          <p className="part__name">{part.name}</p>
        </div>

        <div className="part__actions">
          {part.supply_risk.level !== 'none' && (
            <span className={`tag ${part.supply_risk.level === 'high' ? 'tag--error' : 'tag--warning'}`}>{part.supply_risk.reasons.join(', ')}</span>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => (signedIn ? undefined : onNeedLogin('Log in to save parts to a project.'))}
            disabled={signedIn}
            title={signedIn ? 'Project workspace is the next build step' : undefined}
          >
            Add to Project
          </button>
        </div>
      </div>

      {specs.length > 0 && (
        <dl className="chips">
          {specs.map((s) => (
            <div key={s.label} className="chip">
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <button type="button" className="link-btn" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : 'View'} technical details
        <ChevronIcon className={open ? 'chev chev--open' : 'chev'} />
      </button>

      {open && (
        <div id={detailId} className="detail">
          {part.description && <p className="detail__desc">{part.description}</p>}
          <table className="spec-table">
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col">As published</th>
                <th scope="col">Parsed value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(part.specs).map(([key, s]) => (
                <tr key={key}>
                  <th scope="row">{specLabel(key)}</th>
                  <td>{s.raw}</td>
                  <td>
                    {formatSpec(s) || 'n/a'}
                    {s.status === 'ambiguous' && <span className="tag tag--warning">Check</span>}
                    {s.status === 'failed' && <span className="tag tag--error">Not parsed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="detail__foot">
            {part.price !== null && <span>Unit price ~ {part.price.toFixed(2)}</span>}
            {part.stock !== null && <span>Stock {part.stock.toLocaleString()}</span>}
            {part.datasheet_url && (
              <a href={part.datasheet_url} target="_blank" rel="noreferrer">
                Datasheet
              </a>
            )}
          </p>
        </div>
      )}
    </li>
  );
}
