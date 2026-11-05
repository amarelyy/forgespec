/** Shared icon sprite. Use with <Icon name="search" />. One stroke weight, no emoji. */
export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></symbol>
      <symbol id="i-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></symbol>
      <symbol id="i-left" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6" /></symbol>
      <symbol id="i-right" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" /></symbol>
      <symbol id="i-pause" viewBox="0 0 24 24"><path d="M9 5v14M15 5v14" /></symbol>
      <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z" /></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></symbol>
      <symbol id="i-pen" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" /></symbol>
    </svg>
  );
}

export type IconName = 'search' | 'chev' | 'left' | 'right' | 'pause' | 'play' | 'lock' | 'pen';

export function Icon({ name, size, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`ico ${className}`.trim()} style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function LogoMark() {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <rect x="1" y="1" width="24" height="24" rx="6" fill="#2563eb" />
      <path d="M8 7v12M8 10h5a3 3 0 0 1 3 3v6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="8" cy="7" r="2.2" fill="#fff" />
      <circle cx="16" cy="19" r="2.2" fill="#fff" />
      <circle cx="8" cy="19" r="2.2" fill="#fff" />
    </svg>
  );
}
