import { useEffect, useRef, useState } from 'react';
import type { User } from '../index';

/** Signed-in header control: a three-line menu button that opens the account panel. */
export function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on a click outside or on Escape (focus returns to the button).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="umenu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`umenu-btn${open ? ' is-open' : ''}`}
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls="umenu-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="burger" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open && (
        <div className="umenu-panel" id="umenu-panel">
          <div className="umenu-who">
            <span>Signed in as</span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <nav aria-label="Pages">
            <a href="#top" onClick={() => setOpen(false)}>
              Home
            </a>
            <p className="umenu-label">Settings</p>
            {/* Settings pages are not built yet. */}
            <span className="umenu-sub is-soon" aria-disabled="true">
              Account Profile <small>Soon</small>
            </span>
            <span className="umenu-sub is-soon" aria-disabled="true">
              Team Members &amp; Roles <small>Soon</small>
            </span>
          </nav>
          <button
            type="button"
            className="umenu-out"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
