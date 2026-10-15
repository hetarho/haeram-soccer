import { PixelIcon, type PixelIconName } from './PixelIcon';

/** The trophy-cabinet pieces keep distinct silhouettes in the shared pixel family. */
export type TrophyKind =
  'league' | 'cup' | 'continental' | 'final' | 'promotion' | 'relegation' | 'best';

const PIECES: Record<TrophyKind, PixelIconName> = {
  league: 'cup',
  cup: 'liddedCup',
  continental: 'continentalCup',
  final: 'medal',
  promotion: 'promotion',
  relegation: 'relegation',
  best: 'star',
};

export function TrophyIcon({ kind }: { kind: TrophyKind }) {
  return <PixelIcon name={PIECES[kind]} size={56} />;
}
