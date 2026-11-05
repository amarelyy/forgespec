import type { RefObject } from 'react';
import { PartDrawer } from './PartDrawer';
import type { useSearch } from './useSearch';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  search: ReturnType<typeof useSearch>;
  signedIn: boolean;
  onNeedLogin: (reason: string) => void;
  onGuest: () => void;
}

export function Hero({ inputRef, search, signedIn, onNeedLogin, onGuest }: Props) {
  return (
    <section className="hero" id="library" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 id="hero-title">
            Catch the 3.3&nbsp;V part on your 5&nbsp;V rail <em>before you buy it.</em>
          </h1>
          <p className="sub">
            ForgeSpec is version control for your bill of materials. It checks every part for voltage and size problems while you plan.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary" onClick={onGuest}>
              Browse parts as guest
            </button>
            <a className="btn" href="#tour">
              Watch how it works
            </a>
          </div>
          <p className="hero-note">
            No account needed to browse parts. Press <kbd>/</kbd> to search.
          </p>
        </div>

        <PartDrawer inputRef={inputRef} search={search} signedIn={signedIn} onNeedLogin={onNeedLogin} />
      </div>
    </section>
  );
}
