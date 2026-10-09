import { memo, useId } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import {
  crestOf,
  type Crest,
  type CrestEmblem,
  type CrestPattern,
  type CrestShape,
} from './crests';
import s from './ClubCrest.module.css';

/** Outlines in a 40×48 box. */
const SHAPES: Record<CrestShape, string> = {
  shield: 'M4 4H36V22C36 34 28 41 20 45C12 41 4 34 4 22Z',
  round: 'M2 25A18 18 0 1 0 38 25A18 18 0 1 0 2 25Z',
  french: 'M4 4H36V31C36 35 33 38 29 38H24L20 45L16 38H11C7 38 4 35 4 31Z',
  badge: 'M13 4H27L36 13V35L27 44H13L4 35V13Z',
  diamond: 'M20 3L37 24L20 45L3 24Z',
  crown: 'M4 9L10 4L15 9L20 4L25 9L30 4L36 9V24C36 35 28 41 20 45C12 41 4 35 4 24Z',
};
const PATTERNS: Record<CrestPattern, string> = {
  plain: '',
  stripes: 'M6 0H11V48H6Z M16 0H21V48H16Z M26 0H31V48H26Z',
  hoops: 'M0 10H40V15H0Z M0 21H40V26H0Z M0 32H40V37H0Z',
  halves: 'M20 0H40V48H20Z',
  quarters: 'M20 0H40V25H20Z M0 25H20V48H0Z',
  sash: 'M0 6L6 0L40 40L34 48Z',
  chevron: 'M0 18L20 32L40 18V28L20 42L0 28Z',
  cross: 'M16 0H24V48H16Z M0 20H40V28H0Z',
  band: 'M0 18H40V31H0Z',
  checks:
    'M0 0H8V8H0Z M16 0H24V8H16Z M32 0H40V8H32Z M8 8H16V16H8Z M24 8H32V16H24Z M0 16H8V24H0Z M16 16H24V24H16Z M32 16H40V24H32Z M8 24H16V32H8Z M24 24H32V32H24Z M0 32H8V40H0Z M16 32H24V40H16Z M32 32H40V40H32Z M8 40H16V48H8Z M24 40H32V48H24Z',
};
/** Icons in a 12×12 box. */
const EMBLEMS: Record<CrestEmblem, string> = {
  star: 'M6 0.5L7.6 4.3L11.7 4.6L8.6 7.2L9.6 11.2L6 9L2.4 11.2L3.4 7.2L0.3 4.6L4.4 4.3Z',
  ball: 'M6 0.5A5.5 5.5 0 1 1 5.99 0.5ZM6 2A4 4 0 1 0 6.01 2Z M6 3.6L8.3 5.3L7.4 8H4.6L3.7 5.3Z',
  crown: 'M1 9.5L0.5 3L3.5 5.5L6 1.5L8.5 5.5L11.5 3L11 9.5Z M1 10.3H11V11.6H1Z',
  moon: 'M8 1A5.5 5.5 0 1 0 11 9.5A4.5 4.5 0 1 1 8 1Z',
  sun: 'M6 3A3 3 0 1 1 5.99 3Z M5.4 0H6.6V2H5.4Z M5.4 10H6.6V12H5.4Z M0 5.4H2V6.6H0Z M10 5.4H12V6.6H10Z M1.6 2.4L2.4 1.6L3.8 3L3 3.8Z M8.2 9L9 8.2L10.4 9.6L9.6 10.4Z M9 3.8L8.2 3L9.6 1.6L10.4 2.4Z M1.6 9.6L3 8.2L3.8 9L2.4 10.4Z',
  bolt: 'M7 0L1.5 7H5.5L4.5 12L10.5 4.5H6.5Z',
  flame: 'M6 0C7 3 10 4.5 10 8A4 4 0 0 1 2 8C2 6 3 5 4 4C4 6 5 6.5 5.5 6.5C5 4 5 2 6 0Z',
  anchor:
    'M5.3 1.5A1.6 1.6 0 1 1 6.7 1.5V4H8.5V5.2H6.7V10.2C8.4 10 9.6 8.9 10 7.5L9 7.2L11 5.5L11.6 8C11 10.4 8.8 12 6 12C3.2 12 1 10.4 0.4 8L1 5.5L3 7.2L2 7.5C2.4 8.9 3.6 10 5.3 10.2V5.2H3.5V4H5.3Z',
  tower: 'M1.5 0.5H3.5V2H5V0.5H7V2H8.5V0.5H10.5V4H9.5V11.5H2.5V4H1.5Z M5 8V11.5H7V8A1 1 0 0 0 5 8Z',
  tree: 'M6 0L10.5 6H8L11 10H6.8V12H5.2V10H1L4 6H1.5Z',
  mountain: 'M0 11L4 4L6 7L8 3L12 11Z',
  wave: 'M0 3.5C1.5 1.5 3 1.5 4 3.5S6.5 5.5 8 3.5S10.5 1.5 12 3.5V6C10.5 4 9 4 8 6S5.5 8 4 6S1.5 4 0 6Z M0 8C1.5 6 3 6 4 8S6.5 10 8 8S10.5 6 12 8V10.5C10.5 8.5 9 8.5 8 10.5S5.5 12.5 4 10.5S1.5 8.5 0 10.5Z',
  key: 'M3.5 0.5A3.5 3.5 0 1 1 3.49 0.5ZM3.5 2.3A1.7 1.7 0 1 0 3.51 2.3Z M5.5 5.8L11.5 11.3L10.5 12.3L9.3 11.1L8.2 12.2L7.4 11.4L8.5 10.3L4.6 6.7Z',
  heart: 'M6 11.5L1.2 6.7A3 3 0 0 1 6 2.6A3 3 0 0 1 10.8 6.7Z',
  gem: 'M3 1H9L12 4.5L6 11.5L0 4.5Z',
  arrow: 'M6 0L11 5.5H7.6V12H4.4V5.5H1Z',
  bird: 'M0 5C2.5 4 4.5 4.5 6 7C7.5 4.5 9.5 4 12 5C9.5 5.5 7.5 7 6 10C4.5 7 2.5 5.5 0 5Z',
  wheel:
    'M6 0.5A5.5 5.5 0 1 1 5.99 0.5ZM6 2A4 4 0 1 0 6.01 2Z M5.3 2.2H6.7V9.8H5.3Z M2.2 5.3H5.3V6.7H2.2Z M6.7 5.3H9.8V6.7H6.7Z',
  clover:
    'M6 0.5A2.6 2.6 0 1 1 5.99 0.5Z M2.6 4.4A2.6 2.6 0 1 1 2.59 4.4Z M9.4 4.4A2.6 2.6 0 1 1 9.39 4.4Z M5.3 6H6.7L7.4 12H4.6Z',
  horseshoe: 'M2 1H4.5V6A1.5 1.5 0 0 0 7.5 6V1H10V6.5A4 4 0 0 1 2 6.5Z',
};
const HOLLOW = new Set<CrestEmblem>(['ball', 'key', 'wheel', 'tower']);

export const CrestMark = memo(function CrestMark({
  crest,
  size = 20,
  label,
  className,
}: {
  crest: Crest;
  /** Rendered width in CSS pixels; the height keeps the 5:6 crest ratio. */
  size?: number;
  /** Accessible name; without it the crest is decorative next to a visible club name. */
  label?: string;
  className?: string;
}) {
  const clip = `crest-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const outline = SHAPES[crest.shape];
  return (
    <svg
      className={`${s.crest} ${className || ''}`}
      width={size}
      height={Math.round(size * 1.2)}
      viewBox="0 0 40 48"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clip}>
          <path d={outline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="40" height="48" fill={crest.primary} />
        {PATTERNS[crest.pattern] && <path d={PATTERNS[crest.pattern]} fill={crest.secondary} />}
      </g>
      <path
        d={outline}
        fill="none"
        className={s.outline}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle
        cx="20"
        cy="25"
        r="8.6"
        fill={crest.primary}
        stroke={crest.secondary}
        strokeWidth="1.8"
      />
      <path
        transform="translate(14 19)"
        d={EMBLEMS[crest.emblem]}
        fill={crest.secondary}
        fillRule={HOLLOW.has(crest.emblem) ? 'evenodd' : 'nonzero'}
      />
    </svg>
  );
});

/** The crest of a club in this world, resolved from its ID. */
export function ClubCrest({
  w,
  id,
  size,
  label,
  className,
}: {
  w: Pick<World, 'seed' | 'clubs' | 'playerClub'>;
  id: string | undefined;
  size?: number;
  label?: string;
  className?: string;
}) {
  return <CrestMark crest={crestOf(w, id)} size={size} label={label} className={className} />;
}
