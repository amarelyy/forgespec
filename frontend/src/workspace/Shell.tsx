import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useMatch } from 'react-router';
import { LogoMark } from '../ui/Sprite';
import { useSession } from './context';
import { WsIcon, WsIconName } from './icons';

export interface ShellContext {
  /** Slot in the top bar where a page can place its own actions. */
  actions: HTMLElement | null;
}

type Item = [to: string, label: string, icon: WsIconName];

const PROJECT: Item[] = [
  ['bom', 'BOM', 'bom'],
  ['history', 'History', 'history'],
  ['compatibility', 'Checks', 'compatibility'],
  ['sub-assemblies', 'Sub-asm', 'sub'],
  ['export', 'Export', 'export'],
];
const GLOBAL: Item[] = [
  ['library', 'Library', 'library'],
  ['rules', 'Rules', 'rules'],
  ['settings', 'Settings', 'settings'],
];

/** Top bar plus sidebar. Inside a project the sidebar adds the project tools and keeps you in the project. */
export function Shell() {
  const { api, user, logout } = useSession();
  const projectId = useMatch('/projects/:id/*')?.params.id;
  const [name, setName] = useState('');
  const [actions, setActions] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setName('');
    if (projectId) api.projects.get(projectId).then((p) => setName(p.name), () => setName('Project not found'));
  }, [api, projectId]);

  const base = projectId ? `/projects/${projectId}` : '';
  const items: Item[] = projectId ? [...PROJECT, ...GLOBAL] : [['dashboard', 'Projects', 'dashboard'], ...GLOBAL];

  return (
    <div className="ws">
      <header className="ws-top">
        <Link className="ws-brand" to="/dashboard">
          <LogoMark />
          ForgeSpec
        </Link>
        {projectId && (
          <>
            <span className="ws-slash" aria-hidden="true">
              /
            </span>
            <strong className="ws-project">{name}</strong>
          </>
        )}
        <div className="ws-actions" ref={setActions} />
        <span className="ws-user" title={user.email}>
          {user.name}
        </span>
        <button type="button" className="btn ws-sm" onClick={logout}>
          Log Out
        </button>
      </header>

      <nav className="ws-side" aria-label="Workspace">
        {projectId && (
          <Link to="/dashboard" className="ws-nav">
            <WsIcon name="dashboard" />
            Projects
          </Link>
        )}
        {items.map(([to, label, icon], i) => (
          <NavLink key={to} to={`${base}/${to}`} className={({ isActive }) => `ws-nav${isActive ? ' is-on' : ''}${projectId && i === PROJECT.length ? ' is-split' : ''}`}>
            <WsIcon name={icon} />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="ws-main">
        <Outlet context={{ actions } satisfies ShellContext} />
      </main>
    </div>
  );
}
