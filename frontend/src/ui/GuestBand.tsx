interface Props {
  onGuest: () => void;
  onLogin: () => void;
  onSignUp: () => void;
}

export function GuestBand({ onGuest, onLogin, onSignUp }: Props) {
  return (
    <section className="block" id="register">
      <div className="wrap">
        <div className="guest">
          <div>
            <h2>Look around first. Sign up when you want to save.</h2>
            <p>Guests can search and read every part. An account lets you save projects, add your own parts and invite your team.</p>
          </div>
          <div className="acts">
            <button type="button" className="btn" onClick={onGuest}>
              Browse parts as guest
            </button>
            <button type="button" className="btn ghost" onClick={onSignUp}>
              Sign Up
            </button>
            <button type="button" className="btn ghost" onClick={onLogin}>
              Log In
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
