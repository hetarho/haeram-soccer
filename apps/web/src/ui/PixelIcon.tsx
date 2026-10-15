/** Original 16px-grid game glyphs: solid silhouettes with deliberate stepped edges. */
const PIXEL_PATHS = {
  home: 'M7 1h2v2h2v2h2v2h2v2h-2v6H3V9H1V7h2V5h2V3h2Z M5 9v4h2V9Z M9 11v4h2v-4Z',
  ball: 'M5 1h6v2h2v2h2v6h-2v2h-2v2H5v-2H3v-2H1V5h2V3h2Z M5 3v2H3v6h2v2h6v-2h2V5h-2V3Z M6 6h4v4H6Z',
  table:
    'M1 2h14v12H1Z M3 4v2h2V4Z M7 4v2h6V4Z M3 8v1h2V8Z M7 8v1h6V8Z M3 11v1h2v-1Z M7 11v1h6v-1Z',
  cup: 'M4 1h8v2h3v5h-2v2h-2v2H9v2h3v2H4v-2h3v-2H5v-2H3V8H1V3h3Z M3 5v2h2V5Z M11 5v2h2V5Z',
  people: 'M5 2h6v1h2v2h2v4h-3v6H4V9H1V5h2V3h2Z M6 2v3h4V2Z',
  training: 'M1 5h2V3h2v4h6V3h2v2h2v6h-2v2h-2V9H5v4H3v-2H1Z',
  trend: 'M6 1h9v9h-2V5h-2v2H9v2H7v2H5v2H3v2H1v-2h2v-2h2V9h2V7h2V5h2V3H6Z',
  history: 'M2 1h10v2h2v12H4v-2H2Z M4 3v8h6V3Z M6 4h2v5H6Z M4 13h8v-1H4Z',
  menu: 'M1 2h14v3H1Z M1 7h14v3H1Z M1 12h14v3H1Z',
  bell: 'M7 1h2v1h2v2h2v6h2v3H1v-3h2V4h2V2h2Z M6 14h4v2H6Z',
  news: 'M1 2h11v3h3v9H3v-1H1Z M3 4v3h3V4Z M8 4v1h2V4Z M8 7v1h2V7Z M3 9v1h7V9Z M3 11v1h7v-1Z M12 7v5h1V7Z',
  eye: 'M5 3h6v2h2v2h2v2h-2v2h-2v2H5v-2H3V9H1V7h2V5h2Z M5 5v2H3v2h2v2h6V9h2V7h-2V5Z M7 6h2v4H7Z',
  close: 'M2 2h3v2h2v2h2V4h2V2h3v3h-2v2h-2v2h2v2h2v3h-3v-2H9v-2H7v2H5v2H2v-3h2V9h2V7H4V5H2Z',
  chevronDown: 'M3 5h2v2h2v2h2V7h2V5h2v2h-2v2h-2v2H7V9H5V7H3Z',
  chevronRight: 'M5 2h2v2h2v2h2v4H9v2H7v2H5v-2h2v-2h2V6H7V4H5Z',
  chevronLeft: 'M11 2H9v2H7v2H5v4h2v2h2v2h2v-2H9v-2H7V6h2V4h2Z',
  check: 'M12 2h3v3h-2v2h-2v2H9v2H7v2H5v-2H3V9H1V6h3v2h2v2h1V8h2V6h2V4h1Z',
  filter: 'M1 2h14v3H1Z M4 7h8v3H4Z M6 12h4v3H6Z',
  star: 'M7 1h2v3h2v2h4v2h-2v2h-2v2h2v3H9v-2H7v2H3v-3h2v-2H3V8H1V6h4V4h2Z',
  liddedCup:
    'M7 0h2v2h3v2H4V2h3Z M4 5h8v1h3v4h-3v2H9v2h3v2H4v-2h3v-2H4v-2H1V6h3Z M3 8v1h2V8Z M11 8v1h2V8Z',
  continentalCup:
    'M4 2h8V1h4v7h-2v2h-3v2H9v2h3v2H4v-2h3v-2H5v-2H2V8H0V1h4Z M2 3v4h3V3Z M11 3v4h3V3Z',
  medal: 'M3 0h4v5H5V3H3Z M9 0h4v3h-2v2H9Z M5 5h6v2h2v6h-2v2H5v-2H3V7h2Z M6 8v4h4V8Z',
  promotion: 'M2 1h12v8h-2v3h-2v2H6v-2H4V9H2Z M7 3h2v2h2v2h2v2H9v3H7V9H3V7h2V5h2Z',
  relegation: 'M2 1h12v8h-2v3h-2v2H6v-2H4V9H2Z M7 3h2v3h4v2h-2v2H9v2H7v-2H5V8H3V6h4Z',
} as const;

export type PixelIconName = keyof typeof PIXEL_PATHS;

/** Decorative glyph; the containing control supplies its visible/accessible name. */
export function PixelIcon({
  name,
  size = 24,
  className,
}: {
  name: PixelIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      data-pixel-icon={name}
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
      style={{ fill: 'currentColor', stroke: 'none' }}
    >
      <path d={PIXEL_PATHS[name]} fillRule="evenodd" />
    </svg>
  );
}
