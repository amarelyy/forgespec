import { useCallback, useEffect, useRef, useState } from 'react';
import type { ForgeSpecApi, User } from '../index';
import { api as defaultApi } from './api';
import { AuthDialog, AuthMode } from './AuthDialog';
import { Footer } from './Footer';
import { Header } from './Header';
import { Carousel } from './Carousel';
import { GuestBand } from './GuestBand';
import { Hero } from './Hero';
import { LibrarySection } from './LibrarySection';
import { Sprite } from './Sprite';
import { Walkthrough } from './Walkthrough';
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
  // Every "as guest" button goes to the Component Library section and puts the cursor in its search box.
  const goLibrary = useCallback(() => {
    document.getElementById('library')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const logout = async () => {
    await api.auth.logout().catch(() => undefined);
    setUser(null);
  };

  const authDialog = (
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
  );

  return (
    <>
      <Sprite />
      <Header
        user={user}
        onLogin={() => openLogin()}
        onSignUp={() => setDialog({ mode: 'register' })}
        onGuest={goLibrary}
        onLogout={logout}
        onNeedLogin={openLogin}
        onLibrary={goLibrary}
      />
      <main id="top">
        <Hero onGuest={goLibrary} />
        <Carousel />
        <Walkthrough />
        <LibrarySection inputRef={inputRef} search={search} signedIn={!!user} onNeedLogin={openLogin} />
        <GuestBand onGuest={goLibrary} onLogin={() => openLogin()} onSignUp={() => setDialog({ mode: 'register' })} />
      </main>
      <Footer />
      {authDialog}
    </>
  );
}
