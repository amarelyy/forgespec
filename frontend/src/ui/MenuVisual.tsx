import { useEffect, useRef } from 'react';
import type { MenuVisualKind } from './menuMotion';

/** Mounts one looping 3D preview; three.js is loaded on first use (the same chunk the hero board uses). */
export function MenuVisual({ kind }: { kind: MenuVisualKind }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof WebGLRenderingContext === 'undefined') return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cleanup = () => undefined as void;
    let cancelled = false;
    import('./menuMotion')
      .then(({ initMenuVisual }) => {
        if (!cancelled && ref.current) cleanup = initMenuVisual(ref.current, kind, reduce);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [kind]);

  return <div ref={ref} className="mv-stage" aria-hidden="true" />;
}
