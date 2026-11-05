/**
 * Auto-advancing carousel. The slides and dots are rendered by React (Carousel.tsx);
 * this only drives the motion: each dot's progress bar advances the slide when it finishes.
 * Returns a cleanup function so React StrictMode can mount, unmount and mount again safely.
 */

const setIcon = (btn: HTMLElement, name: string, label: string) => {
  btn.querySelector('use')?.setAttribute('href', `#i-${name}`);
  btn.setAttribute('aria-label', label);
};

export function initCarousel(root: HTMLElement, reduce: boolean): () => void {
  const ac = new AbortController();
  const { signal } = ac;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  const reel = q('.reel');
  const slides = [...reel.children] as HTMLElement[];
  const dots = [...root.querySelectorAll<HTMLButtonElement>('.dot')];
  const play = q('.car-pause');
  const viewport = q('.viewport');

  root.style.setProperty('--dur', '4s');
  let index = 0;
  let userPaused = reduce;

  const show = (i: number) => {
    index = (i + slides.length) % slides.length;
    reel.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((s, k) => {
      s.setAttribute('aria-hidden', String(k !== index));
      s.inert = k !== index;
    });
    dots.forEach((d, k) => {
      d.classList.toggle('done', k < index);
      d.removeAttribute('aria-current');
    });
    void root.offsetWidth; // restart the fill animation
    dots[index].setAttribute('aria-current', 'true');
  };

  // Keeps moving on hover and after arrow clicks; only the pause button stops it.
  const sync = () => root.classList.toggle('paused', userPaused);

  dots.forEach((d, k) => d.addEventListener('click', () => show(k), { signal }));
  root.addEventListener(
    'animationend',
    (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('fill') && t.parentElement?.getAttribute('aria-current') === 'true') show(index + 1);
    },
    { signal },
  );
  q('.prev').addEventListener('click', () => show(index - 1), { signal });
  q('.next').addEventListener('click', () => show(index + 1), { signal });
  play.addEventListener(
    'click',
    () => {
      userPaused = !userPaused;
      setIcon(play, userPaused ? 'play' : 'pause', userPaused ? 'Play slideshow' : 'Pause slideshow');
      sync();
    },
    { signal },
  );

  let startX: number | null = null;
  viewport.addEventListener('pointerdown', (e) => (startX = e.clientX), { signal });
  viewport.addEventListener(
    'pointerup',
    (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    },
    { signal },
  );

  setIcon(play, reduce ? 'play' : 'pause', reduce ? 'Play slideshow' : 'Pause slideshow');
  show(0);
  sync();

  return () => ac.abort();
}
