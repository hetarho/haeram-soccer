/** What a trophy-cabinet entry is, which decides how it is drawn. */
export type TrophyKind =
  'league' | 'cup' | 'continental' | 'final' | 'promotion' | 'relegation' | 'best';

/** A soft highlight stroke down the left of a metal shape. */
const SHINE = { fill: 'none', stroke: '#fff', strokeLinecap: 'round', opacity: 0.35 } as const;
const HANDLE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.2,
  strokeLinecap: 'round',
} as const;

/**
 * The cabinet's pieces (→WEB-54): a league title is the classic two-handled cup, the domestic cup
 * a lidded cup, a continental title the big-eared cup, a final a runner-up medal, moves up and
 * down a shield with an arrow and the best finish a star. Drawn in `currentColor`.
 */
export function TrophyIcon({ kind }: { kind: TrophyKind }) {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
      {kind === 'league' ? (
        <>
          <path d="M20 14h-6c0 8 3.5 12 9 13" {...HANDLE} />
          <path d="M44 14h6c0 8-3.5 12-9 13" {...HANDLE} />
          <path d="M19 9h26v11c0 10-6 17-13 17s-13-7-13-17z" fill="currentColor" />
          <path d="M24 13v7c0 6 2.5 10 6 12" strokeWidth="2.4" {...SHINE} />
          <rect x="28.5" y="36" width="7" height="8" fill="currentColor" />
          <rect x="22" y="44" width="20" height="5" rx="1.5" fill="currentColor" />
          <rect x="18" y="49" width="28" height="8" rx="2" fill="currentColor" opacity="0.75" />
        </>
      ) : kind === 'cup' ? (
        <>
          <circle cx="32" cy="7" r="3" fill="currentColor" />
          <path d="M22 15c0-4 4.5-6 10-6s10 2 10 6z" fill="currentColor" />
          <path d="M22 19c-7 0-8 9-1 11" {...HANDLE} />
          <path d="M42 19c7 0 8 9 1 11" {...HANDLE} />
          <path d="M21 16h22l-2 14c-1 5-4.5 8-9 8s-8-3-9-8z" fill="currentColor" />
          <path d="M26 19l1 10c.5 3 2 5 4 6" strokeWidth="2.2" {...SHINE} />
          <rect x="29" y="38" width="6" height="7" fill="currentColor" />
          <path d="M24 45h16l3 5H21z" fill="currentColor" />
          <rect x="19" y="50" width="26" height="7" rx="2" fill="currentColor" opacity="0.75" />
        </>
      ) : kind === 'continental' ? (
        <>
          <path d="M23 15c-12-7-17 6-10 13 3 3 7 3 10 1" {...HANDLE} />
          <path d="M41 15c12-7 17 6 10 13-3 3-7 3-10 1" {...HANDLE} />
          <path d="M23 10h18v13c0 8-4 14-9 14s-9-6-9-14z" fill="currentColor" />
          <path d="M27 14v8c0 5 1.5 8 4 10" strokeWidth="2.2" {...SHINE} />
          <rect x="29" y="37" width="6" height="6" fill="currentColor" />
          <path d="M23 43h18l2 6H21z" fill="currentColor" />
          <rect x="19" y="49" width="26" height="8" rx="2" fill="currentColor" opacity="0.75" />
        </>
      ) : kind === 'final' ? (
        <>
          <path d="M21 4h9l5 18h-9z" fill="currentColor" opacity="0.55" />
          <path d="M43 4h-9l-5 18h9z" fill="currentColor" opacity="0.8" />
          <circle cx="32" cy="39" r="17" fill="currentColor" />
          <circle
            cx="32"
            cy="39"
            r="11.5"
            fill="none"
            stroke="#000"
            strokeOpacity="0.22"
            strokeWidth="2.5"
          />
          <path d="M23 33c2-4 5-6 9-6.5" strokeWidth="2.6" {...SHINE} />
        </>
      ) : kind === 'best' ? (
        <>
          <path
            d="M32 5l7.6 16.2 17.4 2.2-12.8 12.1 3.3 17.5L32 44.4 16.5 53l3.3-17.5L7 23.4l17.4-2.2z"
            fill="currentColor"
          />
          <path d="M28 20l-5 1M24.5 29l-5 4.5" strokeWidth="2.4" {...SHINE} />
        </>
      ) : (
        <>
          <path d="M32 5l21 7v16c0 14-9 23-21 30C20 51 11 42 11 28V12z" fill="currentColor" />
          <path
            d={kind === 'promotion' ? 'M22 33l10-10 10 10M32 24v19' : 'M22 31l10 10 10-10M32 40V21'}
            fill="none"
            stroke="#fff"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        </>
      )}
    </svg>
  );
}
