import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Project, Template } from '../index';
import { errorText, money, useSession } from './context';
import { WsIcon } from './icons';
import { Modal } from './Modal';

export function Dashboard() {
  const { api } = useSession();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.projects.list().then(setProjects, (e) => setError(errorText(e)));
  }, [api]);

  return (
    <section className="ws-page">
      <div className="ws-pagehead">
        <h1>Projects</h1>
        <button type="button" className="btn btn-primary ws-sm" onClick={() => setCreating(true)}>
          <WsIcon name="plus" />
          Create New Project
        </button>
      </div>

      {error && <p className="ws-error" role="alert">{error}</p>}
      {!projects && !error && <p className="ws-muted">Loading projects...</p>}
      {projects?.length === 0 && <p className="ws-muted">No projects yet. Create one to start a bill of materials.</p>}

      <ul className="ws-cards">
        {projects?.map((p) => (
          <li key={p.id}>
            <Link className="ws-card" to={`/projects/${p.id}/bom`}>
              <span className="ws-card-top">
                <strong>{p.name}</strong>
                <span className="ws-role">{p.role}</span>
              </span>
              <span className="ws-muted">{p.description || 'No description'}</span>
              <span className="ws-metrics">
                <span>{p.metrics.component_count} parts</span>
                <span>{money(p.metrics.estimated_cost)}</span>
                <span className={p.metrics.error_count ? 'pill p-err' : 'pill p-ok'}>
                  {p.metrics.error_count ? `${p.metrics.error_count} ${p.metrics.error_count === 1 ? 'error' : 'errors'}` : 'No errors'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {creating && <NewProject onClose={() => setCreating(false)} />}
    </section>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const { api } = useSession();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.projects.templates().then(setTemplates, () => undefined);
  }, [api]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api.projects.create({ name: name.trim(), description, template_id: template || undefined });
      navigate(`/projects/${p.id}/bom`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="New project" onClose={onClose}>
      <form className="ws-form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Start from template
          <select value={template} onChange={(e) => setTemplate(e.target.value)} disabled={!templates.length}>
            <option value="">{templates.length ? 'Blank project' : 'Blank project (no saved templates yet)'}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.item_count} parts)
              </option>
            ))}
          </select>
        </label>
        {error && <p className="ws-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary ws-sm" disabled={busy || !name.trim()}>
          {busy ? 'Creating...' : 'Create project'}
        </button>
      </form>
    </Modal>
  );
}
