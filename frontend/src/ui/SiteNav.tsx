import { FocusEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

/**
 * Main header navigation, following docs/image.png. Text only.
 * Standard dropdowns: open on hover (with a short close delay), on click/tap, and from the keyboard;
 * Escape or a click outside closes them.
 * Pages that are not built yet: guests are asked to log in (they need an account anyway); signed-in users see "Soon".
 */

interface Item {
  label: string;
  /** In-page link that works today. */
  href?: string;
  onClick?: () => void;
  /** Needs an account (Dashboard, Project Workspace, Custom Part Creator). */
  login?: string;
  /** Page not built yet. */
  soon?: boolean;
  /** Indented under the item above, e.g. Compare Versions under Version History. */
  child?: boolean;
}
interface Group {
  label?: string;
  note?: string;
  items: Item[];
}
interface Menu {
  id: string;
  label: string;
  href?: string;
  groups?: Group[];
}

interface Props {
  signedIn: boolean;
  onNeedLogin: (reason: string) => void;
  /** Scrolls to the Component Library section and focuses its search box. */
  onLibrary: () => void;
}

export function SiteNav({ signedIn, onNeedLogin, onLibrary }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const closeTimer = useRef(0);
  const lastPointer = useRef('mouse');

  const ws = 'Log in to open your projects.';
  const menus: Menu[] = [
    { id: 'home', label: 'Home', href: '#top' },
    {
      id: 'dashboard',
      label: 'Dashboard',
      groups: [
        {
          label: 'Projects',
          items: [
            { label: 'Your projects', login: ws, soon: true },
            { label: 'Create new project', login: 'Log in to create a project.', soon: true },
          ],
        },
        {
          label: 'Project workspace',
          note: 'Opens from a project',
          items: [
            { label: 'Component List (BOM)', login: ws, soon: true },
            { label: 'Version History', login: ws, soon: true },
            { label: 'Compare Versions', login: ws, soon: true, child: true },
            { label: 'Compatibility Report', login: ws, soon: true },
            { label: 'Sub-assemblies', login: ws, soon: true },
            { label: 'Export', login: ws, soon: true },
          ],
        },
      ],
    },
    {
      id: 'library',
      label: 'Component Library',
      groups: [
        {
          note: 'Guests can browse. Saving needs an account.',
          items: [
            { label: 'Search components', onClick: onLibrary },
            { label: 'Component details', onClick: onLibrary },
            { label: 'Custom Part Creator', login: 'Log in to create a custom part.', soon: true },
          ],
        },
      ],
    },
  ];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const btn = navRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="sn-${open}"]`);
      setOpen(null);
      btn?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const hoverOpen = (id: string | null) => (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return; // touch opens on tap instead
    clearTimeout(closeTimer.current);
    setOpen(id);
  };
  const hoverClose = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 180);
  };
  // Tabbing out of a dropdown closes it.
  const onBlur = (e: FocusEvent<HTMLLIElement>) => {
    const id = e.currentTarget.dataset.menu;
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen((o) => (o === id ? null : o));
  };

  const renderItem = (it: Item) => {
    const cls = `sn-link${it.child ? ' is-child' : ''}`;
    if (it.href) {
      return (
        <a className={cls} href={it.href} onClick={() => setOpen(null)}>
          {it.label}
        </a>
      );
    }
    if (it.login && !signedIn) {
      return (
        <button type="button" className={cls} onClick={() => (setOpen(null), onNeedLogin(it.login!))}>
          {it.label}
          <small>Log in</small>
        </button>
      );
    }
    if (it.soon) {
      return (
        <span className={`${cls} is-soon`} aria-disabled="true">
          {it.label}
          <small>Soon</small>
        </span>
      );
    }
    return (
      <button type="button" className={cls} onClick={() => (setOpen(null), it.onClick?.())}>
        {it.label}
      </button>
    );
  };

  return (
    <nav className="site-nav" aria-label="Main" ref={navRef}>
      <ul className="sn-bar">
        {menus.map((m) => (
          <li key={m.id} data-menu={m.id} className={open === m.id ? 'is-open' : undefined} onPointerEnter={hoverOpen(m.groups ? m.id : null)} onPointerLeave={hoverClose} onBlur={onBlur}>
            {m.groups ? (
              <>
                <button
                  type="button"
                  className="sn-top"
                  aria-expanded={open === m.id}
                  aria-controls={`sn-${m.id}`}
                  onPointerDown={(e) => (lastPointer.current = e.pointerType)}
                  // A mouse already opened it on hover, so a click keeps it open; keyboard and touch toggle.
                  onClick={(e) => {
                    const toggles = e.detail === 0 || lastPointer.current !== 'mouse';
                    setOpen((o) => (o === m.id && toggles ? null : m.id));
                  }}
                >
                  {m.label}
                </button>
                <div id={`sn-${m.id}`} className={`sn-panel${m.groups.length > 1 ? ' is-wide' : ''}`} hidden={open !== m.id}>
                  {m.groups.map((g, i) => (
                    <div key={g.label ?? i} className="sn-group">
                      {(g.label || g.note) && (
                        <p className="sn-label">
                          {g.label && <strong>{g.label}</strong>}
                          {g.note && <span>{g.note}</span>}
                        </p>
                      )}
                      <ul>
                        {g.items.map((it) => (
                          <li key={it.label}>{renderItem(it)}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <a className="sn-top" href={m.href} onClick={() => setOpen(null)}>
                {m.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
