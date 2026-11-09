import type { User } from '../index';
import { LogoMark } from './Sprite';
import { SiteNav } from './SiteNav';
import { UserMenu } from './UserMenu';

interface Props {
  user: User | null;
  onLogin: () => void;
  onSignUp: () => void;
  onGuest: () => void;
  onLogout: () => void;
  onNeedLogin: (reason: string) => void;
  onLibrary: () => void;
}

export function Header({ user, onLogin, onSignUp, onGuest, onLogout, onNeedLogin, onLibrary }: Props) {
  return (
    <header className="nav">
      <div className="wrap">
        <a className="logo" href="#top" aria-label="ForgeSpec home">
          <LogoMark />
          ForgeSpec
        </a>

        <SiteNav signedIn={!!user} onNeedLogin={onNeedLogin} onLibrary={onLibrary} />

        <nav className="nav-cta" aria-label="Account">
          {user ? (
            <UserMenu user={user} onLogout={onLogout} />
          ) : (
            <>
              <button type="button" className="btn btn-text" onClick={onLogin}>
                Log In
              </button>
              <button type="button" className="btn btn-outline" onClick={onSignUp}>
                Sign Up
              </button>
              <button type="button" className="btn btn-primary" onClick={onGuest}>
                Try as Guest
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
