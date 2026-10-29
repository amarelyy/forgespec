import { useCallback, useEffect, useRef, useState } from 'react';
import type { ForgeSpecApi, User } from '../index';
import { api as defaultApi } from './api';
import { AuthDialog, AuthMode } from './AuthDialog';
import { Footer } from './Footer';
import { Header } from './Header';
import { Hero } from './Hero';
import { ValueProps } from './ValueProps';
import { useSearch } from './useSearch';

/** `api` is injectable so tests can run the page without a server. */
export function App({ api = defaultApi }: { api?: ForgeSpecApi }) {
  const [user, setUser] = useState<User | null>(null);
  const [dialog, setDialog] = useState<{ mode: AuthMode; reason?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSearch(api);

  // Restore the session if tokens are stored. Guests never see an error here.
  useEffect(() => {
    if (!api.isAuthenticated) return;
    api.auth.profile().then(setUser, () => setUser(null));
  }, [api]);

  const openLogin = useCallback((reason?: string) => setDialog({ mode: 'login', reason }), []);
  const focusSearch = useCallback(() => {
    inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const logout = async () => {
    await api.auth.logout().catch(() => undefined);
    setUser(null);
  };

  return (
    <>
      <Header
        user={user}
        onLogin={() => openLogin()}
        onSignUp={() => setDialog({ mode: 'register' })}
        onGuest={focusSearch}
        onLogout={logout}
      />
      <main>
        <Hero inputRef={inputRef} search={search} signedIn={!!user} onNeedLogin={openLogin} />
        <ValueProps />
      </main>
      <Footer />
      <AuthDialog
        mode={dialog?.mode ?? null}
        reason={dialog?.reason}
        api={api}
        onModeChange={(mode) => setDialog({ mode })}
        onClose={() => setDialog(null)}
        onSuccess={(u) => {
          setUser(u);
          setDialog(null);
        }}
      />
    </>
  );
}
