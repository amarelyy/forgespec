interface Props {
  onGuest: () => void;
}

export function Hero({ onGuest }: Props) {
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

        {/* Reserved for the 3D circuit board (next step). Decorative only, so hidden from screen readers. */}
        <div className="hero-stage" aria-hidden="true">
          <span>3D circuit board goes here</span>
        </div>
      </div>
    </section>
  );
}
