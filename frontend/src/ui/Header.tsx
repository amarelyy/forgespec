import type { User } from '../index';
import { LogoMark } from './icons';

interface Props {
  user: User | null;
  onLogin: () => void;
  onSignUp: () => void;
  onGuest: () => void;
  onLogout: () => void;
}

export function Header({ user, onLogin, onSignUp, onGuest, onLogout }: Props) {
  return (
    <header className="header">
      <div className="container header__inner">
        <a className="logo" href="/" aria-label="ForgeSpec home">
          <LogoMark className="logo__mark" width={28} height={28} />
          <span className="logo__text">ForgeSpec</span>
        </a>

        <nav className="header__actions" aria-label="Account">
          {user ? (
            <>
              <span className="header__user" title={user.email}>
                Signed in as <strong>{user.name}</strong>
              </span>
              <button type="button" className="btn btn--ghost" onClick={onLogout}>
                Log Out
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn--ghost" onClick={onLogin}>
                Log In
              </button>
              <button type="button" className="btn btn--outline" onClick={onSignUp}>
                Sign Up
              </button>
              <button type="button" className="btn btn--primary" onClick={onGuest}>
                Try as Guest
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
