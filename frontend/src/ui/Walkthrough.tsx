import { CSSProperties, ComponentType, memo, useEffect, useRef, useState } from 'react';
import { ArtCheck, ArtFix, ArtSave, ArtSearch, ArtSpecs } from './journeyArt';

/**
 * The walkthrough as a route: one road with five stops, laid out like a circuit trace (straight runs, 45° bends,
 * uneven lengths) rather than a map. A navigation arrow drives the route and stops at each one;
 * the active stop's drawing plays and the rest fade back. Drawings alternate above and below the road.
 * Pauses while pointed at, focused or off screen. With reduced motion everything shows at once, finished.
 */

const W = 1128;
const H = 500;
const ROUTE = 'M-30 270 H40 L100 210 H230 L330 310 H440 L490 260 H540 L600 200 H690 L810 320 H900 L1000 220 H1090 L1150 280 H1180';

interface Stop {
  name: string;
  x: number;
  y: number;
  side: 'up' | 'down';
  labelLeft?: boolean;
  Art: ComponentType;
}
const STOPS: Stop[] = [
  { name: 'Search the part', x: 165, y: 210, side: 'up', Art: ArtSearch },
  { name: 'Specs arrive', x: 385, y: 310, side: 'down', Art: ArtSpecs },
  { name: 'The check fails', x: 645, y: 200, side: 'up', Art: ArtCheck },
  { name: 'Fix it', x: 855, y: 320, side: 'down', Art: ArtFix },
  { name: 'Save a version', x: 1045, y: 220, side: 'up', labelLeft: true, Art: ArtSave },
];

const DWELL_MS = 4600;
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

type Motion = { mode: 'travel'; from: number; to: number; t: number; dur: number; then: () => void } | { mode: 'dwell'; left: number; then: () => void } | null;

export const Walkthrough = memo(function Walkthrough() {
  const [active, setActive] = useState(-1);
  const [play, setPlay] = useState(0);
  const [reduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const progRef = useRef<SVGPathElement>(null);
  const failRef = useRef<SVGPathElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const jumpTo = useRef<(i: number) => void>((i) => {
    setActive(i);
    setPlay((p) => p + 1);
  });

  useEffect(() => {
    const path = pathRef.current;
    const root = rootRef.current;
    if (!path || !root || typeof path.getTotalLength !== 'function') return; // no SVG geometry (tests): stops still work
    const prog = progRef.current!;
    const fail = failRef.current!;
    const car = carRef.current!;
    const total = path.getTotalLength();
    const lenAt = (x: number) => {
      let lo = 0;
      let hi = total;
      for (let k = 0; k < 32; k++) {
        const m = (lo + hi) / 2;
        if (path.getPointAtLength(m).x < x) lo = m;
        else hi = m;
      }
      return lo;
    };
    const L = STOPS.map((s) => lenAt(s.x));
    prog.style.strokeDasharray = `${total} ${total}`;
    fail.style.strokeDasharray = `0 ${L[1]} ${L[2]! - L[1]!} ${total}`;

    let pos = 0;
    const place = (len: number) => {
      pos = len;
      const p = path.getPointAtLength(len);
      const q = path.getPointAtLength(Math.min(total, len + 1));
      const deg = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 90;
      car.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${deg})`);
      prog.style.strokeDashoffset = String(total - len);
    };

    if (reduce) {
      place(L[4]!);
      jumpTo.current = (i) => {
        setActive(i);
        place(L[i]!);
      };
      return;
    }

    let motion: Motion = null;
    let held = false;
    let offscreen = false;
    const travel = (to: number, dur: number, then: () => void) => (motion = { mode: 'travel', from: pos, to, t: 0, dur, then });
    const arrive = (i: number) => {
      setActive(i);
      setPlay((p) => p + 1);
      motion = { mode: 'dwell', left: DWELL_MS, then: () => next(i) };
    };
    const next = (i: number) => {
      if (i < STOPS.length - 1) {
        travel(L[i + 1]!, 1800, () => arrive(i + 1));
        setActive(-1);
        return;
      }
      setActive(-1);
      travel(total, 1100, () => {
        place(0);
        travel(L[0]!, 1100, () => arrive(0));
      });
    };
    jumpTo.current = (i) => travel(L[i]!, 900, () => arrive(i));

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(64, now - last) : 0;
      last = now;
      if (held || offscreen || !motion) return;
      if (motion.mode === 'travel') {
        motion.t += dt;
        const k = Math.min(1, motion.t / motion.dur);
        place(motion.from + (motion.to - motion.from) * ease(k));
        if (k >= 1) {
          const then = motion.then;
          motion = null;
          then();
        }
      } else {
        motion.left -= dt;
        if (motion.left <= 0) {
          const then = motion.then;
          motion = null;
          then();
        }
      }
    };

    const io = new IntersectionObserver(([e]) => (offscreen = !e?.isIntersecting), { threshold: 0.25 });
    io.observe(root);
    const enter = (e: PointerEvent) => e.pointerType === 'mouse' && (held = true);
    const leave = () => (held = false);
    const focusIn = () => (held = true);
    const focusOut = (e: FocusEvent) => !root.contains(e.relatedTarget as Node | null) && (held = false);
    root.addEventListener('pointerenter', enter);
    root.addEventListener('pointerleave', leave);
    root.addEventListener('focusin', focusIn);
    root.addEventListener('focusout', focusOut);

    place(0);
    travel(L[0]!, 1100, () => arrive(0));
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      root.removeEventListener('pointerenter', enter);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('focusin', focusIn);
      root.removeEventListener('focusout', focusOut);
    };
  }, [reduce]);

  return (
    <section className="block" id="tour" aria-labelledby="tour-title">
      <div className="wrap">
        <h2 id="tour-title">Watch one sensor go from search to saved</h2>
        <div ref={rootRef} className={`jm${reduce ? ' is-static' : ''}${active === 2 ? ' is-fail' : ''}`}>
          <svg className="jm-map" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {/* the route */}
            <path className="jm-road-case" d={ROUTE} />
            <path className="jm-road" d={ROUTE} />
            <path className="jm-plan" d={ROUTE} />
            <path ref={progRef} className="jm-prog" d={ROUTE} />
            <path ref={failRef} className="jm-fail" d={ROUTE} />
            <path ref={pathRef} d={ROUTE} fill="none" stroke="none" />
            <g ref={carRef} className="jm-car" transform={`translate(-30 270) rotate(90)`}>
              <path d="M0 -11L8 8L0 3L-8 8Z" />
            </g>
          </svg>

          <ol className="jm-stops" aria-label="Five steps">
            {STOPS.map((s, i) => {
              const on = reduce || i === active;
              const style = { '--x': `${(s.x / W) * 100}%`, '--y': `${(s.y / H) * 100}%` } as CSSProperties;
              return (
                <li key={s.name} className={`jm-stop is-${s.side}${s.labelLeft ? ' is-label-left' : ''}${i === active ? ' is-on' : ''}`} style={style}>
                  <button type="button" className="jm-pin" aria-pressed={i === active} onClick={() => jumpTo.current(i)}>
                    <span className="jm-num">{i + 1}</span>{' '}
                    <span className="jm-name">{s.name}</span>
                  </button>
                  <figure className={`jm-art${on && !reduce ? ' is-play' : ''}`} key={on ? `play-${play}` : 'idle'} aria-hidden="true">
                    <s.Art />
                  </figure>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
});
