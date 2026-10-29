import { FormEvent, RefObject, useEffect, useState } from 'react';
import { SearchIcon } from './icons';
import { Results } from './Results';
import type { useSearch } from './useSearch';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  search: ReturnType<typeof useSearch>;
  signedIn: boolean;
  onNeedLogin: (reason: string) => void;
}

const EXAMPLE_QUERY = 'STM32F407';

export function Hero({ inputRef, search, signedIn, onNeedLogin }: Props) {
  const [query, setQuery] = useState('');
  const { run } = search;

  // Search as you type, after a short pause. Enter / the button searches immediately.
  useEffect(() => {
    const t = setTimeout(() => run(query), 350);
    return () => clearTimeout(t);
  }, [query, run]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(query);
  };

  const tryExample = () => {
    setQuery(EXAMPLE_QUERY);
    inputRef.current?.focus();
  };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero__inner">
        <h1 id="hero-title" className="hero__title">
          Bill of Materials &amp; Version Control for Hardware
        </h1>
        <p className="hero__sub">
          Manage hardware projects without voltage mismatches or physical conflicts. Check compatibility in real-time before you buy.
        </p>

        <form className="search" role="search" onSubmit={submit}>
          <label htmlFor="part-search" className="sr-only">
            Search by manufacturer part number
          </label>
          <SearchIcon className="search__icon" />
          <input
            id="part-search"
            ref={inputRef}
            className="search__input"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search Part Number (e.g., STM32F407, LM7805...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn--primary search__btn">
            Search
          </button>
        </form>

        <ul className="pills" aria-label="How ForgeSpec works">
          <li>
            <button type="button" className="pill" onClick={tryExample}>
              <span className="pill__n">1</span> Auto-fetch Specs
            </button>
          </li>
          <li>
            <button type="button" className="pill" onClick={() => onNeedLogin('Log in to run compatibility checks on a project.')}>
              <span className="pill__n">2</span> Check Compatibility
            </button>
          </li>
          <li>
            <button type="button" className="pill" onClick={() => onNeedLogin('Log in to save parts to a project.')}>
              <span className="pill__n">3</span> Save to Project
            </button>
          </li>
        </ul>

        <p className="hint">
          <strong>Guest access:</strong> search and view full technical details without an account. Log in to save parts and run compatibility checks.
        </p>

        <Results state={search.state} signedIn={signedIn} onNeedLogin={onNeedLogin} />
      </div>
    </section>
  );
}
