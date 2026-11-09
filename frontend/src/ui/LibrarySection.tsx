import type { RefObject } from 'react';
import { PartDrawer } from './PartDrawer';
import type { useSearch } from './useSearch';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  search: ReturnType<typeof useSearch>;
  signedIn: boolean;
  onNeedLogin: (reason: string) => void;
}

/** Comes right after the walkthrough: "you watched it, now try it". Pressing "/" anywhere still jumps here. */
export function LibrarySection({ inputRef, search, signedIn, onNeedLogin }: Props) {
  return (
    <section className="block lib-section" id="library" aria-labelledby="library-title">
      <div className="wrap lib-section-grid">
        <div className="sec-head">
          <h2 id="library-title">Now try it yourself</h2>
          <p>
            Search any part number and read the specs the way ForgeSpec parses them. No account needed. Press <kbd>/</kbd> from anywhere on the page to jump here.
          </p>
        </div>
        <PartDrawer inputRef={inputRef} search={search} signedIn={signedIn} onNeedLogin={onNeedLogin} />
      </div>
    </section>
  );
}
