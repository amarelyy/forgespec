import { HeroBoard } from './HeroBoard';
import type { BoardPick } from './boardMotion';

interface Props {
  onGuest: () => void;
  signedIn: boolean;
  onNeedLogin: (reason: string) => void;
}

export function Hero({ onGuest, signedIn, onNeedLogin }: Props) {
  // Board parts link into the page: the MCU to the library, the red sensor to the check, the regulator to the walkthrough.
  const onPick = (id: BoardPick) => {
    if (id === 'mcu') onGuest();
    else document.getElementById(id === 'sensor' ? 'features' : 'tour')?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <section className="hero" id="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 id="hero-title">
            Catch the 3.3&nbsp;V part on your 5&nbsp;V rail <em>before you buy it.</em>
          </h1>
          <p className="sub">
            ForgeSpec is version control for your bill of materials. It checks every part for voltage and size problems while you plan.
          </p>
          <div className="hero-actions">
            {/* The workspace page is not built yet: guests are asked to log in, signed-in users see it as coming soon. */}
            <button
              type="button"
              className="btn btn-primary hero-main"
              disabled={signedIn}
              title={signedIn ? 'The project workspace is coming soon' : undefined}
              onClick={() => onNeedLogin('Log in to enter your workspace.')}
            >
              Enter Workspace
            </button>
            <button type="button" className="btn" onClick={onGuest}>
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

        <HeroBoard onPick={onPick} />
      </div>
    </section>
  );
}
