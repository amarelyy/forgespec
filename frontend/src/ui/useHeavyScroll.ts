import { useEffect } from 'react';

/**
 * "Heavy" page scrolling for mouse wheels and trackpads: one flick of the wheel glides the page down to the next section over about a second instead of nudging it a few pixels. A section taller than the screen is
 * crossed one screen at a time. Touch, keyboard, reduced-motion and scrollable inner panels keep native scrolling.
 */
const SECTIONS = ['hero', 'features', 'tour', 'library', 'register'];
const DURATION = 1100;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function useHeavyScroll() {
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq || mq.matches) return;

    const navH = () => document.querySelector<HTMLElement>('header.nav')?.offsetHeight ?? 65;
    let busy = false;
    let raf = 0;
    let lastWheel = 0;

    const tops = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const list = SECTIONS.map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el)
        .map((el) => {
          if (el.id === 'hero') return 0;
          // Use the box around the section's real content, not its padding, so the content is what gets centred.
          const holder = el.querySelector<HTMLElement>(':scope > .wrap') ?? el;
          const kids = Array.from(holder.children).map((c) => c.getBoundingClientRect());
          const box = { top: Math.min(...kids.map((r) => r.top)), height: Math.max(...kids.map((r) => r.bottom)) - Math.min(...kids.map((r) => r.top)) };
          const top = box.top + window.scrollY;
          const room = window.innerHeight - navH();
          return Math.round(top - navH() - Math.max(0, (room - box.height) / 2));
        })
        .map((t) => Math.min(max, Math.max(0, t)));
      list.push(max); // footer: the very bottom
      return [...new Set(list)].sort((x, y) => x - y);
    };

    const glide = (to: number) => {
      const from = window.scrollY;
      if (Math.abs(to - from) < 2) return;
      busy = true;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / DURATION));
        window.scrollTo(0, from + (to - from) * ease(t));
        if (t < 1) raf = requestAnimationFrame(step);
        else busy = false;
      };
      raf = requestAnimationFrame(step);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // pinch zoom, sideways scroll
      // Let lists, text areas and open dialogs scroll by themselves.
      for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
        if (el.tagName === 'DIALOG' || el.closest?.('[role="dialog"]')) return;
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
          const atEdge = e.deltaY < 0 ? el.scrollTop <= 0 : el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if (!atEdge) return;
        }
      }
      if (e.deltaY < 0) {
        // Going up is normal smooth scrolling; just stop any glide that is still running.
        cancelAnimationFrame(raf);
        busy = false;
        return;
      }
      e.preventDefault();
      const now = performance.now();
      // One gesture = one move: ignore the long tail of a trackpad flick.
      const fresh = now - lastWheel > 120;
      lastWheel = now;
      if (busy || !fresh || Math.abs(e.deltaY) < 4) return;

      const y = window.scrollY;
      const list = tops();
      const down = e.deltaY > 0;
      let target: number | undefined;
      if (down) {
        target = list.find((t) => t > y + 8);
        if (target !== undefined) target = (target - y > window.innerHeight * 1.15 ? y + window.innerHeight * 0.9 : target);
      } else {
        target = [...list].reverse().find((t) => t < y - 8);
        if (target !== undefined) target = (y - target > window.innerHeight * 1.15 ? y - window.innerHeight * 0.9 : target);
      }
      if (target !== undefined) glide(Math.max(0, target));
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(raf);
    };
  }, []);
}
