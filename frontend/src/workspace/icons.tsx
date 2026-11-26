const PATHS = {
  dashboard: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  bom: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8M3.5 3.5V8H8',
  compatibility: 'M12 3l8 3v6c0 5-3.5 7.8-8 9-4.5-1.2-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  sub: 'M12 3l8 4.5-8 4.5-8-4.5zM4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5',
  export: 'M12 3v12M7 10l5 5 5-5M5 20h14',
  library: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  rules: 'M5 6h14M5 12h14M5 18h14M9 4v4M15 10v4M8 16v4',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

export type WsIconName = keyof typeof PATHS;

export function WsIcon({ name }: { name: WsIconName }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
