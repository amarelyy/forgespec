import type { User } from '../index';
import { LogoMark } from './Sprite';

interface Props {
  user: User | null;
  onLogin: () => void;
  onSignUp: () => void;
  onGuest: () => void;
  onLogout: () => void;
}

export function Header({ user, onLogin, onSignUp, onGuest, onLogout }: Props) {
  return (
    <header className="nav">
      <div className="wrap">
        <a className="logo" href="#top" aria-label="ForgeSpec home">
          <LogoMark />
          ForgeSpec
        </a>

        <nav className="nav-cta" aria-label="Account">
          {user ? (
            <>
              <span className="nav-user" title={user.email}>
                Signed in as <strong>{user.name}</strong>
              </span>
              <button type="button" className="btn btn-outline" onClick={onLogout}>
                Log Out
              </button>
            </>
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
