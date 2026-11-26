import { FocusEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { MenuVisual } from './MenuVisual';
import { siteMenus } from './siteMap';
import type { SiteItem as Item } from './siteMap';

/**
 * Main header navigation, following docs/image.png, styled as a mega menu: bold uppercase tabs centred in the header,
 * a full-width panel with text columns, and a preview on the right that explains whichever item is hovered.
 * Every item gets a small looping 3D preview that acts out what the page does.
 * The pages come from siteMap.ts (the footer lists the same ones).
 */

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

  const menus = siteMenus(onLibrary);

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
            <small>Sign in</small>
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
