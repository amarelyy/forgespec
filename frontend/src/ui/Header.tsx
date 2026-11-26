import type { ForgeSpecApi, User } from '../index';
import { HeaderSearch } from './HeaderSearch';
import { LogoMark } from './Sprite';
import { SiteNav } from './SiteNav';
import { UserMenu } from './UserMenu';

interface Props {
  api: Pick<ForgeSpecApi, 'library'>;
  user: User | null;
  onSignIn: () => void;
  onGuest: () => void;
  onLogout: () => void;
  onNeedLogin: (reason: string) => void;
  onLibrary: () => void;
}

/** Six items at most: logo (home), two menus, search, Sign In, Try as Guest. Signing up lives inside the Sign In window. */
export function Header({ api, user, onSignIn, onGuest, onLogout, onNeedLogin, onLibrary }: Props) {
  return (
    <header className="nav">
      <div className="wrap">
        <a className="logo" href="#top" aria-label="ForgeSpec, home">
          <LogoMark />
          ForgeSpec
        </a>

        <SiteNav signedIn={!!user} onNeedLogin={onNeedLogin} onLibrary={onLibrary} />

        <div className="nav-end">
          <HeaderSearch api={api} signedIn={!!user} onNeedLogin={onNeedLogin} onLibrary={onLibrary} />
          <nav className="nav-cta" aria-label="Account">
            {user ? (
              <UserMenu user={user} onLogout={onLogout} />
            ) : (
              <>
                <button type="button" className="btn btn-outline" onClick={onSignIn}>
                  Sign In
                </button>
                <button type="button" className="btn btn-primary nav-guest" onClick={onGuest}>
                  Try as Guest
                </button>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
