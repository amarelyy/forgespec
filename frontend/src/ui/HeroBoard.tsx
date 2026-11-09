import { memo, useEffect, useRef, useState } from 'react';
import type { BoardPick } from './boardMotion';

/**
 * The hero's 3D circuit board. three.js loads in its own chunk after the page is up, so the headline is never
 * waiting on it. Decorative (aria-hidden): every place it links to is also reachable from normal links.
 */
export const HeroBoard = memo(function HeroBoard({ onPick }: { onPick: (id: BoardPick) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof WebGLRenderingContext === 'undefined') return; // no WebGL (old browsers, tests): keep the fallback
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cleanup = () => undefined as void;
    let cancelled = false;
    import('./boardMotion')
      .then(({ initHeroBoard }) => {
        if (cancelled || !ref.current) return;
        cleanup = initHeroBoard(ref.current, { reduce, onPick: (id) => pick.current(id), onReady: () => setReady(true) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return <div ref={ref} className={`hero-stage${ready ? ' is-ready' : ''}`} aria-hidden="true" />;
});
