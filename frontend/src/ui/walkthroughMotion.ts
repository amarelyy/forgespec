/**
 * Animated one-use-case walkthrough. React renders the markup (Walkthrough.tsx);
 * this drives the five scenes. Elements are found by `data-w` attributes.
 * Returns a cleanup that clears every timer, listener and observer.
 */

const DUR = [3800, 4200, 4200, 4200, 4000];

const setIcon = (btn: HTMLElement, name: string, label: string) => {
  btn.querySelector('use')?.setAttribute('href', `#i-${name}`);
  btn.setAttribute('aria-label', label);
  const t = btn.querySelector('span');
  if (t) t.textContent = label;
};

export function initWalkthrough(root: HTMLElement, reduce: boolean): () => void {
  const ac = new AbortController();
  const { signal } = ac;
  const w = (name: string) => root.querySelector<HTMLElement>(`[data-w="${name}"]`)!;

  const steps = [...root.querySelectorAll<HTMLElement>('.step')];
  const play = w('play');
  const app = root.querySelector<HTMLElement>('.app')!;
  const el = {
    search: w('search'), typed: w('typed'), ph: w('ph'), drop: w('drop'), rams: w('rams'), rbme: w('rbme'),
    why: w('why'), pill: w('pill'), sum: w('sum'), commit: w('commit'), toast: w('toast'), rev: w('rev'),
  };

  let current = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let userPaused = reduce;
  let hover = false;
  // Hold on scene 1 until the section scrolls into view, then play from the start.
  let offscreen = !reduce;

  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, reduce ? 0 : ms));
  const sum = (ok: number, err: number) => {
    el.sum.innerHTML = (err ? `<span class="pill p-err">${err} error</span> ` : '') + `<span class="pill p-ok">${ok} passed</span>`;
  };
  const sync = () => root.classList.toggle('paused', userPaused || hover || offscreen);

  function scene(i: number) {
    timers.forEach(clearTimeout);
    timers = [];
    const added = i >= 2;
    const fixed = i >= 3;
    const saved = i >= 4;

    el.search.classList.toggle('on', i <= 1);
    el.typed.textContent = i >= 1 ? 'BME280' : '';
    el.ph.hidden = i >= 1 ? true : i === 0;
    el.drop.classList.toggle('show', i === 1);
    el.drop.classList.toggle('ready', i === 1);
    el.drop.classList.remove('specs');

    if (i === 0) {
      el.drop.classList.remove('show', 'ready');
      const word = 'BME280';
      [...word].forEach((ch, k) => later(500 + k * 170, () => (el.typed.textContent += ch)));
      later(500 + word.length * 170 + 300, () => el.drop.classList.add('show'));
      later(500 + word.length * 170 + 700, () => el.drop.classList.add('ready'));
    }
    if (i === 1) later(250, () => el.drop.classList.add('specs'));
    if (i >= 2) {
      el.typed.textContent = '';
      el.ph.hidden = false;
    }

    el.rbme.classList.toggle('show', added);
    el.rams.classList.toggle('show', fixed);
    el.rbme.classList.remove('bad', 'good');
    el.commit.classList.remove('ready', 'press');
    el.toast.classList.remove('show');
    el.rev.classList.remove('bump');
    el.rev.textContent = saved ? 'version 15' : 'version 14';
    if (!added) sum(3, 0);

    if (i === 2) {
      el.why.textContent = 'Checking against the 5 V rail…';
      el.pill.innerHTML = '<span class="pill p-warn">Checking</span>';
      sum(3, 0);
      later(1100, () => {
        el.rbme.classList.add('bad');
        el.why.textContent = 'Needs 1.71 – 3.6 V, but the rail is 5 V';
        el.pill.innerHTML = '<span class="pill p-err">Error</span>';
        sum(3, 1);
      });
    }
    if (i >= 3) {
      el.rbme.classList.add('good');
      el.why.textContent = 'Now powered from the 3.3 V regulator';
      el.pill.innerHTML = '<span class="pill p-ok">Pass</span>';
      sum(5, 0);
      el.commit.classList.add('ready');
    }
    if (i === 4) {
      el.rev.textContent = 'version 14';
      later(700, () => el.commit.classList.add('press'));
      later(900, () => {
        el.commit.classList.remove('press');
        el.toast.classList.add('show');
        el.rev.textContent = 'version 15';
        el.rev.classList.add('bump');
      });
    }
  }

  function go(i: number) {
    current = (i + steps.length) % steps.length;
    steps.forEach((s, k) => {
      s.classList.toggle('done', k < current);
      s.removeAttribute('aria-current');
      s.style.setProperty('--dur', `${DUR[k]}ms`);
    });
    void root.offsetWidth; // restart the progress fill
    steps[current].setAttribute('aria-current', 'true');
    scene(current);
  }

  steps.forEach((s, k) => s.querySelector('button')!.addEventListener('click', () => go(k), { signal }));
  root.addEventListener(
    'animationend',
    (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('fill') && t.closest('.step')?.getAttribute('aria-current') === 'true') go(current + 1);
    },
    { signal },
  );
  play.addEventListener(
    'click',
    () => {
      userPaused = !userPaused;
      setIcon(play, userPaused ? 'play' : 'pause', userPaused ? 'Play' : 'Pause');
      sync();
    },
    { signal },
  );
  app.addEventListener('pointerenter', () => { hover = true; sync(); }, { signal });
  app.addEventListener('pointerleave', () => { hover = false; sync(); }, { signal });

  setIcon(play, reduce ? 'play' : 'pause', reduce ? 'Play' : 'Pause');
  root.classList.add('paused');
  go(0);
  sync();

  let observer: IntersectionObserver | null = null;
  if (!reduce && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries, o) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          o.disconnect();
          offscreen = false;
          go(0);
          sync();
        }),
      { threshold: 0.35 },
    );
    observer.observe(root);
  } else {
    offscreen = false;
    sync();
  }

  return () => {
    ac.abort();
    observer?.disconnect();
    timers.forEach(clearTimeout);
  };
}
