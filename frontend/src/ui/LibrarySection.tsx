import { RefObject, useState } from 'react';
import { PartDrawer } from './PartDrawer';
import type { useSearch } from './useSearch';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  search: ReturnType<typeof useSearch>;
  signedIn: boolean;
  onNeedLogin: (reason: string) => void;
  onGuest: () => void;
  onSignUp: () => void;
}

/** Real part numbers from the sample: one click searches for them in the library. */
const TRY = ['LM7805CT', 'BME280', 'ESP32-WROOM-32E', 'MG996R'];

/** Comes right after the walkthrough: "you watched it, now try it". The header search ("/") covers quick look-ups. */
export function LibrarySection({ inputRef, search, signedIn, onNeedLogin, onGuest, onSignUp }: Props) {
  const [request, setRequest] = useState<{ q: string; n: number }>();

  return (
    <section className="block lib-section" id="library" aria-labelledby="library-title">
      <div className="wrap lib-section-grid">
        <div className="lib-copy">
          <h2 id="library-title">Now try it yourself</h2>
          <p>Search any part number and read the specs the way ForgeSpec parses them. No account needed.</p>
          <div className="lib-try" role="group" aria-label="Try a part number">
            <span aria-hidden="true">Try</span>
            {TRY.map((q) => (
              <button key={q} type="button" onClick={() => setRequest((r) => ({ q, n: (r?.n ?? 0) + 1 }))}>
                {q}
              </button>
            ))}
          </div>
          {!signedIn && (
            <div className="lib-acts">
              <button type="button" className="btn btn-primary" onClick={onGuest}>
                Browse parts as guest
              </button>
              <button type="button" className="btn btn-outline" onClick={onSignUp}>
                Sign Up
              </button>
            </div>
          )}
        </div>
        <PartDrawer inputRef={inputRef} search={search} signedIn={signedIn} onNeedLogin={onNeedLogin} request={request} />
      </div>
    </section>
  );
}
