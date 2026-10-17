import { PixelIcon } from './PixelIcon';

export type TrophyKind =
  'league' | 'cup' | 'continental' | 'final' | 'promotion' | 'relegation' | 'best';

type Metal = 'gold' | 'silver';
// Stepped silhouettes, with separate shadow, metal and highlight pixels.
const CUPS = {
  league: [
    'M6 4h12v3h4v7h-2v2h-4v2h-3v3h5v2H6v-2h5v-3H8v-2H4v-2H2V7h4Z M4 9v4h2V9Z M18 9v4h2V9Z',
    'M7 5h10v8h-2v3H9v-3H7Z M11 17h2v4h-2Z M7 21h10v1H7Z',
    'M8 6h2v6H8Z M10 13h2v2h-2Z M4 9h1v3H4Z M8 21h5v1H8Z',
  ],
  cup: [
    'M11 1h2v2h3v2h2v2h4v6h-2v2h-3v2h-3v3h4v3H6v-3h4v-3H7v-2H4v-2H2V7h4V5h2V3h3Z M4 9v3h2V9Z M18 9v3h2V9Z',
    'M9 4h6v1H9Z M7 6h10v2H7Z M7 9h10v4h-2v2H9v-2H7Z M11 16h2v5h-2Z M7 21h10v1H7Z',
    'M11 1h1v2h-1Z M9 6h5v1H9Z M8 9h2v3H8Z M10 13h2v1h-2Z M8 21h5v1H8Z',
  ],
  continental: [
    'M1 2h5v3h2V3h8v2h2V2h5v9h-2v3h-3v2h-3v3h-2v2h5v2H6v-2h5v-2H9v-3H6v-2H3v-3H1Z M3 4v6h1v2h2V7H4V4Z M20 4v3h-2v5h2v-2h1V4Z',
    'M9 4h6v9h-1v3h-4v-3H9Z M7 6h2v6H7Z M15 6h2v6h-2Z M11 17h2v4h-2Z M7 21h10v1H7Z',
    'M10 5h2v7h-2Z M11 13h1v3h-1Z M2 3h2v1H2Z M19 3h2v1h-2Z M8 21h5v1H8Z',
  ],
  final: [
    'M5 2h5v6H8V5H5Z M14 2h5v3h-3v3h-2Z M8 8h8v2h3v9h-3v3H8v-3H5v-9h3Z',
    'M9 9h6v2h3v7h-3v3H9v-3H6v-7h3Z',
    'M9 10h5v1H9Z M7 12h2v5H7Z M10 18h4v2h-4Z',
  ],
} as const;
const METALS: Record<Metal, readonly string[]> = {
  gold: ['#805529', '#c69a48', '#ffe3a0'],
  silver: ['#505c6b', '#9caab8', '#edf4fa'],
};

export function TrophyIcon({ kind, earned = true }: { kind: TrophyKind; earned?: boolean }) {
  if (kind === 'best') return <PixelIcon name="star" size={56} />;
  const paths = kind in CUPS ? CUPS[kind as keyof typeof CUPS] : undefined;
  const metal = METALS[kind === 'league' ? 'gold' : 'silver'];
  return (
    <svg
      width={56}
      height={56}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      {paths ? (
        paths.map((d, index) => (
          <path
            key={index}
            d={d}
            fill={earned ? metal[index] : 'currentColor'}
            fillRule="evenodd"
          />
        ))
      ) : (
        <>
          <path d="M4 19h16v3H4Z" fill="currentColor" opacity={0.4} />
          <path
            d={
              kind === 'promotion'
                ? 'M11 3h2v2h2v2h2v2h2v2h-5v5h-4v-5H5V9h2V7h2V5h2Z'
                : 'M10 3h4v5h5v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5V8h5Z'
            }
            fill="currentColor"
          />
          <path
            d={kind === 'promotion' ? 'M11 7h2v7h-2Z' : 'M11 4h2v7h-2Z'}
            fill="#f4fff6"
            opacity={earned ? 0.5 : 0.15}
          />
        </>
      )}
    </svg>
  );
}
