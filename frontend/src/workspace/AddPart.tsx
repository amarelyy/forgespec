import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Component } from '../index';
import { keySpecs } from '../ui/format';
import { errorText, money, useSession } from './context';
import { railLabel } from './layout';
import { Modal } from './Modal';

interface Props {
  rails: string[];
  onClose: () => void;
  onAdd: (component: Component, rail: string) => Promise<void>;
}

/** Quick search over the distributor catalogue (US-03). The full library is its own page. */
export function AddPart({ rails, onClose, onAdd }: Props) {
  const { api } = useSession();
  const [q, setQ] = useState('');
  const [rail, setRail] = useState(rails[0] ?? '');
  const [results, setResults] = useState<Component[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setResults(null);
    setMessage('');
    if (q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      api.library.search({ q: q.trim(), limit: 8 }).then(
        (r) => live && setResults(r.results),
        (e) => live && setMessage(errorText(e)),
      );
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [api, q]);

  const add = async (c: Component) => {
    setBusy(c.id);
    setMessage('');
    try {
      await onAdd(c, rail);
    } catch (e) {
      setMessage(errorText(e));
    }
    setBusy('');
  };

  return (
    <Modal title="Add part" onClose={onClose}>
      <form className="ws-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Part number or name
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. LM7805" autoFocus />
        </label>
        <label>
          Connect to rail
          <select value={rail} onChange={(e) => setRail(e.target.value)}>
            {rails.map((r) => (
              <option key={r} value={r}>
                {railLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </form>

      {message && <p className="ws-error" role="alert">{message}</p>}
      {q.trim().length >= 2 && !results && !message && <p className="ws-muted">Searching...</p>}
      {results?.length === 0 && (
        <p>
          Component not found. <Link to="../library/new" relative="path">Create a custom part</Link>
        </p>
      )}
      <ul className="ws-results">
        {results?.map((c) => (
          <li key={c.id}>
            <span>
              <strong className="mono">{c.mpn}</strong>
              <small>{keySpecs(c).slice(0, 2).map((s) => `${s.label} ${s.value}`).join(' | ')}</small>
              <small>
                {c.manufacturer}
                {c.price !== null && ` | ${money(c.price)}`}
              </small>
            </span>
            <button type="button" className="btn btn-primary ws-sm" disabled={!!busy} onClick={() => add(c)}>
              {busy === c.id ? 'Adding...' : 'Add'}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
