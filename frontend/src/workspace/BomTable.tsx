import type { BomItem } from '../index';
import { money } from './context';
import { cardSpecs, railLabel } from './layout';

const STATUS = { ok: ['p-ok', 'OK'], warning: ['p-warn', 'Warning'], error: ['p-err', 'Error'] } as const;

export function BomTable({ items, selected, onSelect }: { items: BomItem[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="ws-tablewrap">
      <table className="ws-table">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Part number</th>
            <th>Key specs</th>
            <th>Rail</th>
            <th>Qty</th>
            <th>Line total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const [tone, label] = STATUS[i.compatibility.status];
            return (
              <tr key={i.id} className={`is-${i.compatibility.status}${i.id === selected ? ' is-sel' : ''}`} onClick={() => onSelect(i.id)}>
                <td>{i.designator}</td>
                <td>
                  <button type="button" className="ws-rowbtn mono" onClick={() => onSelect(i.id)}>
                    {i.component.mpn}
                  </button>
                </td>
                <td>{cardSpecs(i).join(' | ')}</td>
                <td>{railLabel(i.rail)}</td>
                <td>{i.quantity}</td>
                <td>{i.line_total === null ? 'No price' : money(i.line_total)}</td>
                <td>
                  <span className={`pill ${tone}`}>{label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!items.length && <p className="ws-muted ws-pad">No parts yet. Use Add part to search the distributor catalogue.</p>}
    </div>
  );
}
