import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import type { BomItem, BomSpecValue, ItemPatch } from '../index';
import { specLabel } from '../ui/format';
import { money } from './context';
import { WsIcon } from './icons';
import { issueText, railLabel, specEntries } from './layout';

interface Props {
  item: BomItem;
  rails: string[];
  canEdit: boolean;
  onClose: () => void;
  onPatch: (patch: ItemPatch) => void;
  onOverride: (key: string, value: number, unit: string | null) => void;
  onReset: (key: string) => void;
  onRemove: () => void;
}

/** Right panel for one part: quick look and small edits (US-04, US-06). */
export function PartPanel({ item, rails, canEdit, onClose, onPatch, onOverride, onReset, onRemove }: Props) {
  const bad = new Set(item.compatibility.issues.flatMap((i) => i.attributes));
  return (
    <>
      <div className="ws-panel-head">
        <div>
          <b>{item.designator || 'Part'}</b>
          <h2 className="mono">{item.component.mpn}</h2>
          <p className="ws-muted">{item.component.name}</p>
        </div>
        <button type="button" className="ws-iconbtn" aria-label="Close part panel" onClick={onClose}>
          <WsIcon name="close" />
        </button>
      </div>

      {item.compatibility.issues.length ? (
        <ul className="ws-issues">
          {item.compatibility.issues.map((i) => (
            <li key={`${i.rule_id}${i.message}`} className={`is-${i.severity}`}>
              <b>{i.rule_name}</b>
              <span>{issueText(i.message, i.rule_name)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pill p-ok ws-allok">No problems found</p>
      )}

      <div className="ws-fields">
        <label>
          Rail
          <select value={item.rail} disabled={!canEdit} onChange={(e) => onPatch({ rail: e.target.value })}>
            {rails.map((r) => (
              <option key={r} value={r}>
                {railLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Qty
          <input
            type="number"
            min={1}
            defaultValue={item.quantity}
            disabled={!canEdit}
            onBlur={(e) => {
              const q = Math.floor(Number(e.target.value));
              if (q >= 1 && q !== item.quantity) onPatch({ quantity: q });
              else e.target.value = String(item.quantity);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
        <label>
          Ref
          <input
            defaultValue={item.designator}
            disabled={!canEdit}
            maxLength={40}
            onBlur={(e) => e.target.value !== item.designator && onPatch({ designator: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
      </div>

      <h3>Specs</h3>
      <p className="ws-muted">Raw datasheet text and the number used by the checks.</p>
      <ul className="ws-specs">
        {specEntries(item).map(([key, spec]) => (
          <Spec key={key} name={key} spec={spec} bad={bad.has(key)} canEdit={canEdit} onSave={onOverride} onReset={onReset} />
        ))}
      </ul>

      <p className="ws-muted">
        {item.component.manufacturer}. {item.unit_price === null ? 'No price' : `${money(item.unit_price)} each`}. Stock {item.component.stock ?? 'unknown'}.
        {item.component.supply_risk.reasons.length > 0 && ` Supply risk: ${item.component.supply_risk.reasons.join(', ')}.`}
      </p>
      <div className="ws-panel-actions">
        <Link className="btn ws-sm" to={`../library/${item.component_id}`} relative="path">
          Full detail
        </Link>
        {canEdit && (
          <button type="button" className="btn ws-sm ws-danger" onClick={onRemove}>
            Remove part
          </button>
        )}
      </div>
    </>
  );
}

interface SpecProps {
  name: string;
  spec: BomSpecValue;
  bad: boolean;
  canEdit: boolean;
  onSave: Props['onOverride'];
  onReset: Props['onReset'];
}

function Spec({ name, spec, bad, canEdit, onSave, onReset }: SpecProps) {
  const [draft, setDraft] = useState(spec.value === null ? '' : String(spec.value));
  const changed = draft.trim() !== '' && Number.isFinite(Number(draft)) && Number(draft) !== spec.value;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (changed) onSave(name, Number(draft), spec.unit);
  };
  return (
    <li className={bad ? 'is-bad' : ''}>
      <form onSubmit={submit}>
        <label htmlFor={`spec-${name}`}>{specLabel(name)}</label>
        <span className="ws-spec-row">
          <code title="Raw datasheet text">{spec.raw || 'no raw text'}</code>
          <input id={`spec-${name}`} inputMode="decimal" value={draft} disabled={!canEdit} onChange={(e) => setDraft(e.target.value)} />
          <span>{spec.unit}</span>
        </span>
        {spec.status !== 'ok' && !spec.overridden && <small>Parser: {spec.note ?? spec.status}</small>}
        {changed && (
          <button type="submit" className="ws-link">
            Save override
          </button>
        )}
        {spec.overridden && !changed && canEdit && (
          <button type="button" className="ws-link" onClick={() => onReset(name)}>
            Overridden. Reset to parsed value
          </button>
        )}
      </form>
    </li>
  );
}
