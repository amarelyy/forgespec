import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext, useParams } from 'react-router';
import type { BomItem, BomTotals, Component, Project } from '../index';
import { AddPart } from './AddPart';
import { BoardCanvas } from './BoardCanvas';
import { BomTable } from './BomTable';
import { errorText, money, useSession } from './context';
import { WsIcon } from './icons';
import { issueText, layoutBoard, nextDesignator, Point, railNames } from './layout';
import { Modal } from './Modal';
import { PartPanel } from './PartPanel';
import type { ShellContext } from './Shell';
import { useStored } from './useStored';

type View = 'canvas' | 'split' | 'list';
const VIEWS: [View, string][] = [['canvas', 'Canvas'], ['split', 'Split'], ['list', 'List']];

export function Workspace() {
  const { id } = useParams() as { id: string };
  const { api } = useSession();
  const { actions } = useOutletContext<ShellContext>();
  const [project, setProject] = useState<Project | null>(null);
  const [bom, setBom] = useState<{ items: BomItem[]; totals: BomTotals } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'add' | 'rail' | 'commit' | null>(null);
  const [view, setView] = useState<View>(() => (window.matchMedia('(max-width: 760px)').matches ? 'list' : 'canvas'));
  // Board arrangement is a personal preference, kept in this browser. Rails with parts live on the server.
  const [positions, setPositions] = useStored<Record<string, Point>>(`fs.board.${id}`, {});
  const [extraRails, setExtraRails] = useStored<string[]>(`fs.rails.${id}`, []);
  const [layoutRun, setLayoutRun] = useState(0);

  const load = useCallback(() => api.bom.list(id).then(setBom), [api, id]);

  useEffect(() => {
    setBom(null);
    setError('');
    setSelected(null);
    Promise.all([api.projects.get(id).then(setProject), load()]).catch((e) => setError(errorText(e)));
  }, [api, id, load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const items = bom?.items ?? [];
  const lanes = useMemo(() => layoutBoard(bom?.items ?? [], extraRails, positions), [bom, extraRails, positions]);
  const rails = railNames(items, [...extraRails, '']);
  const item = items.find((i) => i.id === selected) ?? null;
  const canEdit = !!project && project.role !== 'viewer';
  const problems = items.filter((i) => i.compatibility.status !== 'ok');
  const errors = problems.filter((i) => i.compatibility.status === 'error').length;

  /** Run a change, then re-read the BOM: one edit can change the check status of other parts. */
  const change = async (work: () => Promise<unknown>) => {
    setNotice('');
    try {
      await work();
      await load();
    } catch (e) {
      setNotice(errorText(e));
    }
  };
  const wire = (itemId: string, rail: string) => {
    if (items.find((i) => i.id === itemId)?.rail === rail) return;
    // Forget the dragged spot so the part moves under its new rail.
    setPositions(({ [itemId]: _gone, ...rest }) => rest);
    change(() => api.bom.update(id, itemId, { rail }));
  };

  const add = async (c: Component, rail: string) => {
    const res = await api.bom.add(id, { component_id: c.id, rail, designator: nextDesignator(items) });
    await load();
    setSelected(res.item.id);
    setDialog(null);
  };

  if (error) {
    return (
      <section className="ws-page">
        <p className="ws-error" role="alert">{error}</p>
        <Link className="btn ws-sm" to="/dashboard">Back to projects</Link>
      </section>
    );
  }
  if (!project || !bom) return <p className="ws-wait">Loading board...</p>;

  return (
    <div className="ws-board">
      {actions &&
        createPortal(
          <>
            <div className="ws-switch" role="group" aria-label="View">
              {VIEWS.map(([v, label]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                  {label}
                </button>
              ))}
            </div>
            <span className="ws-role">{project.role}</span>
            {canEdit && (
              <button type="button" className="btn btn-primary ws-sm" onClick={() => setDialog('commit')}>
                Commit
              </button>
            )}
          </>,
          actions,
        )}

      <div className={`ws-stage view-${view}`}>
        {view !== 'canvas' && <BomTable items={items} selected={selected} onSelect={setSelected} />}
        {view !== 'list' && (
          <div className="ws-canvas">
            <BoardCanvas
              key={`${id}-${view}-${layoutRun}`}
              lanes={lanes}
              selected={selected}
              canEdit={canEdit}
              onSelect={setSelected}
              onWire={wire}
              onMove={(itemId, p) => setPositions((old) => ({ ...old, [itemId]: p }))}
            />
            {!lanes.length && <p className="ws-empty">The board is empty. Add a part to start.</p>}
          </div>
        )}
        <div className="ws-tools">
          {canEdit && (
            <>
              <button type="button" className="btn btn-primary ws-sm" onClick={() => setDialog('add')}>
                <WsIcon name="plus" />
                Add part
              </button>
              <button type="button" className="btn ws-sm" onClick={() => setDialog('rail')}>
                Add rail
              </button>
            </>
          )}
          {view !== 'list' && (
            <button type="button" className="btn ws-sm" onClick={() => (setPositions({}), setLayoutRun((n) => n + 1))}>
              Auto-layout
            </button>
          )}
        </div>
        {notice && <p className="ws-toast" role="status">{notice}</p>}
      </div>

      <aside className={`ws-panel${item ? ' is-part' : ''}`} aria-label="Details">
        {item ? (
          <PartPanel
            key={`${item.id}-${item.updated_at}-${JSON.stringify(item.specs)}`}
            item={item}
            rails={rails}
            canEdit={canEdit}
            onClose={() => setSelected(null)}
            onPatch={(patch) => (patch.rail !== undefined ? wire(item.id, patch.rail) : change(() => api.bom.update(id, item.id, patch)))}
            onOverride={(key, value, unit) => change(() => api.bom.overrideSpec(id, item.id, key, value, unit))}
            onReset={(key) => change(() => api.bom.clearOverride(id, item.id, key))}
            onRemove={() => {
              setSelected(null);
              change(() => api.bom.remove(id, item.id));
            }}
          />
        ) : (
          <>
            <h2>Board checks</h2>
            <p className="ws-muted">
              {canEdit ? 'Select a part to edit it. Drag from a part port to another rail to rewire it.' : 'Select a part to inspect it. You have view only access.'}
            </p>
            {problems.length ? (
              <ul className="ws-issues">
                {problems.map((p) => (
                  <li key={p.id} className={`is-${p.compatibility.status}`}>
                    <button type="button" onClick={() => setSelected(p.id)}>
                      <b>
                        {p.designator} {p.component.mpn}
                      </b>
                      {p.compatibility.issues.map((i) => (
                        <span key={`${i.rule_id}${i.message}`}>{issueText(i.message, i.rule_name)}</span>
                      ))}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pill p-ok ws-allok">{items.length ? 'All checks pass' : 'Nothing to check yet'}</p>
            )}
          </>
        )}
      </aside>

      <footer className="ws-status">
        <span className={errors ? 'is-error' : ''}>{errors} parts with errors</span>
        <span className={problems.length - errors ? 'is-warning' : ''}>{problems.length - errors} with warnings</span>
        <span>{bom.totals.component_count} parts</span>
        <span>
          Total {money(bom.totals.estimated_cost)}
          {bom.totals.unpriced_items > 0 && ` (${bom.totals.unpriced_items} without price)`}
        </span>
      </footer>

      {dialog === 'add' && <AddPart rails={rails} onClose={() => setDialog(null)} onAdd={add} />}
      {dialog === 'rail' && (
        <NameDialog
          title="Add rail"
          label="Rail name, e.g. 5V or 3V3"
          button="Add rail"
          required
          onClose={() => setDialog(null)}
          onSubmit={async (name) => setExtraRails((old) => [...new Set([...old, name])])}
        />
      )}
      {dialog === 'commit' && (
        <NameDialog
          title="Commit version"
          label="What changed? (optional)"
          button="Commit"
          onClose={() => setDialog(null)}
          onSubmit={async (summary) => {
            const v = await api.versions.commit(id, summary || undefined);
            setNotice(`Saved version ${v.number}: ${v.summary}`);
          }}
        />
      )}
    </div>
  );
}

interface NameDialogProps {
  title: string;
  label: string;
  button: string;
  required?: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}

function NameDialog({ title, label, button, required, onClose, onSubmit }: NameDialogProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form className="ws-form" onSubmit={submit}>
        <label>
          {label}
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={required ? 40 : 200} autoFocus />
        </label>
        {error && <p className="ws-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary ws-sm" disabled={required && !value.trim()}>
          {button}
        </button>
      </form>
    </Modal>
  );
}
