import { useState } from 'react';
import { MenuVisual } from './MenuVisual';
import { siteMenus } from './siteMap';
import type { SiteItem } from './siteMap';
import { LogoMark } from './Sprite';

const REPO = 'https://github.com/amarelyy/forgespec';

interface Props {
  signedIn: boolean;
  onNeedLogin: (reason: string) => void;
  /** Scrolls to the Component Library section and focuses its search box. */
  onLibrary: () => void;
  onGuest: () => void;
  onEnterWorkspace?: () => void;
}

interface Contact {
  label: string;
  desc: string;
  href: string;
}
const CONTACT: Contact[] = [
  { label: 'GitHub repository', desc: 'All of ForgeSpec’s code is public. Read it, or follow the work as it happens.', href: REPO },
  { label: 'Report a problem', desc: 'Found a bug or have a question? Open an issue on GitHub and the team answers there.', href: `${REPO}/issues` },
];

type Preview = { label: string; desc: string; visual?: SiteItem['visual'] };

/**
 * Footer laid out like the header's mega menu: every page in columns, a contact column, and a preview on the right
 * that explains whichever link is pointed at. The preview also holds the two ways in: the workspace and guest browsing.
 */
export function Footer({ signedIn, onNeedLogin, onLibrary, onGuest, onEnterWorkspace }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const groups = siteMenus(onLibrary).flatMap((m) => m.groups);
  // Projects and Browse/Your parts are short, so they share the first column; Project workspace gets its own.
  const [projects, workspace, browse, yours] = groups;
  const columns = [[projects!, browse!, yours!], [workspace!]];

  const show = (p: Preview) => ({ onPointerEnter: () => setPreview(p), onFocus: () => setPreview(p) });

  const renderItem = (it: SiteItem) => {
    const cls = `ft-link${it.child ? ' is-child' : ''}`;
    if (it.login && !signedIn) {
      return (
        <button type="button" className={cls} {...show(it)} onClick={() => onNeedLogin(it.login!)}>
          {it.label}
          <small>Sign in</small>
        </button>
      );
    }
    if (it.soon) {
      return (
        <span className={`${cls} is-soon`} aria-disabled="true" tabIndex={0} {...show(it)}>
          {it.label}
          <small>Soon</small>
        </span>
      );
    }
    return (
      <button type="button" className={cls} {...show(it)} onClick={() => it.onClick?.()}>
        {it.label}
      </button>
    );
  };

  return (
    <footer className="site-foot" id="contact">
      <div className="wrap ft-grid" onPointerLeave={() => setPreview(null)}>
        {columns.map((col, i) => (
          <div key={i} className="ft-col">
            {col.map((g) => (
              <div key={g.label} className="ft-group">
                <p className="ft-label">
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
          </div>
        ))}

        <div className="ft-col">
          <div className="ft-group">
            <p className="ft-label">
              <strong>Contact</strong>
            </p>
            <ul>
              {CONTACT.map((c) => (
                <li key={c.label}>
                  <a className="ft-link" href={c.href} target="_blank" rel="noreferrer" {...show(c)}>
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="ft-preview" aria-live="polite">
          {preview ? (
            <>
              {preview.visual && <MenuVisual kind={preview.visual} />}
              <strong>{preview.label}</strong>
              <p>{preview.desc}</p>
            </>
          ) : (
            <>
              <strong>ForgeSpec</strong>
              <p>Version control for your bill of materials. Point at a page to see what it is for.</p>
            </>
          )}
          <div className="ft-acts">
            {/* The workspace page is not built yet: guests are asked to sign in, signed-in users see it as coming soon. */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (signedIn ? onEnterWorkspace?.() : onNeedLogin('Sign in to enter your workspace.'))}
            >
              Enter Workspace
            </button>
            <button type="button" className="btn btn-outline" onClick={onGuest}>
              Browse parts as guest
            </button>
          </div>
        </div>
      </div>

      <div className="wrap ft-bottom">
        <a className="logo" href="#top" aria-label="ForgeSpec, back to top">
          <LogoMark />
          ForgeSpec
        </a>
        <span>&copy; 2026 ForgeSpec Team</span>
      </div>
    </footer>
  );
}
