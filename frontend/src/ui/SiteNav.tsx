import { FocusEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import type { MenuVisualKind } from './menuMotion';
import { MenuVisual } from './MenuVisual';

/**
 * Main header navigation, following docs/image.png, styled as a mega menu: bold uppercase tabs centred in the header,
 * a full-width panel with text columns, and a preview on the right that explains whichever item is hovered.
 * Two items whose names are hard to picture (Sub-assemblies, Compare Versions) get a small 3D preview.
 * Pages that are not built yet: guests are asked to log in (they need an account anyway); signed-in users see "Soon".
 */

interface Item {
  label: string;
  /** One line that says what the page is for; shown in the preview. */
  desc: string;
  visual?: MenuVisualKind;
  onClick?: () => void;
  /** Needs an account (Dashboard, Project Workspace, Custom Part Creator). */
  login?: string;
  /** Page not built yet. */
  soon?: boolean;
  /** Indented under the item above, e.g. Compare Versions under Version History. */
  child?: boolean;
}
interface Group {
  label: string;
  note?: string;
  items: Item[];
}
interface Menu {
  id: string;
  label: string;
  intro: string;
  groups: Group[];
}

interface Props {
  signedIn: boolean;
  onNeedLogin: (reason: string) => void;
  /** Scrolls to the Component Library section and focuses its search box. */
  onLibrary: () => void;
}

export function SiteNav({ signedIn, onNeedLogin, onLibrary }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const closeTimer = useRef(0);
  const lastPointer = useRef('mouse');

  const ws = 'Log in to open your projects.';
  const menus: Menu[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      intro: 'Your projects, and everything inside each one.',
      groups: [
        {
          label: 'Projects',
          items: [
            { label: 'Your projects', desc: 'All your boards in one place. Each shows what it costs and whether it has a problem (the red light).', visual: 'projects', login: ws, soon: true },
            { label: 'Create new project', desc: 'Start a new, empty board and begin adding parts to it, or start from one of your templates.', visual: 'create', login: 'Log in to create a project.', soon: true },
          ],
        },
        {
          label: 'Project workspace',
          note: 'Opens from a project',
          items: [
            { label: 'Component List (BOM)', desc: 'Every part on the board, listed with its quantity and price. This is your bill of materials (BOM).', visual: 'bom', login: ws, soon: true },
            { label: 'Version History', desc: 'Each time you save, a new version goes on top of the stack, like commits in Git. You can go back to any of them.', visual: 'history', login: ws, soon: true },
            { label: 'Compare Versions', desc: 'See exactly what changed between two versions: added parts in green, removed parts in red.', visual: 'diff', login: ws, soon: true, child: true },
            { label: 'Compatibility Report', desc: 'ForgeSpec checks every part against your power supply and the other parts. Green passes; red needs fixing before you buy.', visual: 'report', login: ws, soon: true },
            { label: 'Sub-assemblies', desc: 'Build a group of parts once, like a motor driver, then drop it into any project as a single piece.', visual: 'subassembly', login: ws, soon: true },
            { label: 'Export', desc: 'Turn the parts list into a CSV or PDF file, ready to send to a supplier.', visual: 'export', login: ws, soon: true },
          ],
        },
      ],
    },
    {
      id: 'library',
      label: 'Component Library',
      intro: 'Every part from the distributors. Guests can browse; saving needs an account.',
      groups: [
        {
          label: 'Browse',
          items: [
            { label: 'Search components', desc: 'Look up any part number and get its specs from the distributors.', onClick: onLibrary },
            { label: 'Component details', desc: 'The datasheet values for a part, read and turned into numbers you can check.', onClick: onLibrary },
          ],
        },
        {
          label: 'Your parts',
          items: [{ label: 'Custom Part Creator', desc: 'Add a part that no distributor lists, with your own specs.', login: 'Log in to create a custom part.', soon: true }],
        },
      ],
    },
  ];

  const openMenu = (id: string | null) => {
    setOpen(id);
    setPreview(null);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) openMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const btn = navRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="sn-${open}"]`);
      openMenu(null);
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

  const hoverOpen = (id: string) => (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return; // touch opens on tap instead
    clearTimeout(closeTimer.current);
    if (open !== id) openMenu(id);
  };
  const hoverStay = (e: ReactPointerEvent) => e.pointerType === 'mouse' && clearTimeout(closeTimer.current);
  const hoverClose = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => openMenu(null), 200);
  };
  // Tabbing out of the menu closes it.
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) openMenu(null);
  };

  const renderItem = (it: Item) => {
    const cls = `sn-link${it.child ? ' is-child' : ''}`;
    const show = { onPointerEnter: () => setPreview(it), onFocus: () => setPreview(it) };
    const desc = <span className="sn-desc">{it.desc}</span>;
    if (it.login && !signedIn) {
      return (
        <button type="button" className={cls} {...show} onClick={() => (openMenu(null), onNeedLogin(it.login!))}>
          <span className="sn-name">
            {it.label}
            <small>Log in</small>
          </span>
          {desc}
        </button>
      );
    }
    if (it.soon) {
      return (
        <span className={`${cls} is-soon`} aria-disabled="true" tabIndex={0} {...show}>
          <span className="sn-name">
            {it.label}
            <small>Soon</small>
          </span>
          {desc}
        </span>
      );
    }
    return (
      <button type="button" className={cls} {...show} onClick={() => (openMenu(null), it.onClick?.())}>
        <span className="sn-name">{it.label}</span>
        {desc}
      </button>
    );
  };

  const current = menus.find((m) => m.id === open);

  return (
    <nav className="site-nav" aria-label="Main" ref={navRef} onBlur={onBlur}>
      <ul className="sn-bar">
        {menus.map((m) => (
          <li key={m.id} onPointerEnter={hoverOpen(m.id)} onPointerLeave={hoverClose}>
            <button
              type="button"
              className="sn-top"
              aria-expanded={open === m.id}
              aria-controls={`sn-${m.id}`}
              onPointerDown={(e) => (lastPointer.current = e.pointerType)}
              // A mouse already opened it on hover, so a click keeps it open; keyboard and touch toggle.
              onClick={(e) => {
                const toggles = e.detail === 0 || lastPointer.current !== 'mouse';
                openMenu(open === m.id && toggles ? null : m.id);
              }}
            >
              {m.label}
            </button>
          </li>
        ))}
      </ul>

      {menus.map((m) => (
        <div key={m.id} id={`sn-${m.id}`} className="sn-panel" hidden={open !== m.id} onPointerEnter={hoverStay} onPointerLeave={hoverClose}>
          <div className="sn-grid">
            {m.groups.map((g) => (
              <div key={g.label} className="sn-group">
                <p className="sn-label">
                  <strong>{g.label}</strong>
                  {g.note && <span>{g.note}</span>}
                </p>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.label}>{renderItem(it)}</li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="sn-preview" aria-live="polite">
              {preview && open === m.id ? (
                <>
                  {preview.visual && <MenuVisual kind={preview.visual} />}
                  <strong>{preview.label}</strong>
                  <p>{preview.desc}</p>
                </>
              ) : (
                <>
                  <strong>{m.label}</strong>
                  <p>{m.intro}</p>
                  <p className="sn-hint">Point at an item to see what it is for.</p>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      {current && <div className="sn-scrim" aria-hidden="true" onPointerEnter={hoverClose} onClick={() => openMenu(null)} />}
    </nav>
  );
}
