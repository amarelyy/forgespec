import { CSSProperties, useEffect, useRef, useState } from 'react';
import { HeroBoard } from './HeroBoard';
import type { BoardPick } from './boardMotion';

interface Props {
  onGuest: () => void;
}

/** What the app does. Each item ends in a real line from the sample project, split into pieces that arrive one by one. */
const FEATURES = [
  { name: 'Search', desc: 'Type a part number. Specs come straight from the distributor.', proof: ['"1.71V ~ 3.6V"', '→', '1.71–3.6 V'] },
  { name: 'Check', desc: 'Every part is checked against your power rail.', proof: ['BME280', 'fails on the 5 V rail'], bad: true },
  { name: 'Versions', desc: 'Every save is a version you can compare.', proof: ['v14', '→', 'v15', '2 parts added'] },
  { name: 'Export', desc: 'A clean parts list for suppliers, with prices.', proof: ['CSV', 'PDF', 'total $7.41'] },
] as const;

const STEP_MS = 4600;
/**
 * Where each item sits relative to the active one, like a wheel turning: one above, the active one in the middle
 * with its details open, two below. Values are [top in rem, scale, opacity].
 */
const SLOTS: Record<number, [number, number, number]> = { [-1]: [3.6, 0.5, 0.3], 0: [10, 1, 1], 1: [22.6, 0.5, 0.42], 2: [26.8, 0.5, 0.26] };

export function Hero({ onGuest }: Props) {
  const n = FEATURES.length;
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false); // pointer or focus inside the list
  const [offscreen, setOffscreen] = useState(false);
  const [reduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ref = useRef<HTMLDivElement>(null);
  const prevOffset = useRef<number[]>([]);

  // Turns to the next item on its own. Each turn restarts the timer, so a click gets a full turn.
  useEffect(() => {
    if (held || offscreen || reduce) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % n), STEP_MS);
    return () => clearTimeout(t);
  }, [active, held, offscreen, reduce, n]);

  // Holds while the hero is out of view.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e!.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Board parts link into the page: the MCU to the library, the sensor and regulator to the walkthrough.
  const onPick = (id: BoardPick) => {
    if (id === 'mcu') onGuest();
    else document.getElementById('tour')?.scrollIntoView({ behavior: 'smooth' });
  };

  const offsets = FEATURES.map((_, i) => ((i - active + n + 1) % n) - 1);
  // An item that wraps from the top to the bottom of the wheel moves instantly instead of sliding through the others.
  const jumps = offsets.map((o, i) => prevOffset.current[i] !== undefined && Math.abs(o - prevOffset.current[i]!) > 1);
  useEffect(() => {
    prevOffset.current = offsets;
  });

  return (
    <section className="hero" id="hero" aria-labelledby="hero-title">
      <h1 id="hero-title" className="sr-only">
        ForgeSpec: catch the 3.3&nbsp;V part on your 5&nbsp;V rail before you buy it.
      </h1>
      <div className="wrap hero-grid">
        <div
          ref={ref}
          className="wheel"
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHeld(false)}
        >
          <ol className="wheel-list" aria-label="What you can do">
            {FEATURES.map((f, i) => {
              const on = i === active;
              const [y, s, o] = SLOTS[offsets[i]!]!;
              const style = { '--y': `${y}rem`, '--s': s, '--o': o } as CSSProperties;
              return (
                <li key={f.name} className={`wi${on ? ' is-on' : ''}${'bad' in f ? ' is-bad' : ''}${jumps[i] ? ' is-jump' : ''}`} style={style}>
                  <button type="button" className="wi-name" aria-expanded={on} aria-controls={`wi-${i}`} onClick={() => setActive(i)}>
                    {f.name}
                  </button>
                  <div className="wi-more" id={`wi-${i}`}>
                    <div className="wi-inner">
                      <p className="wi-desc">{f.desc}</p>
                      <p className="wi-proof">
                        {f.proof.map((seg, k) => (
                          <span key={k} className={seg === '→' ? 'wi-seg is-arrow' : 'wi-seg'} style={{ '--i': k } as CSSProperties}>
                            {seg}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <HeroBoard onPick={onPick} />
      </div>
    </section>
  );
}
