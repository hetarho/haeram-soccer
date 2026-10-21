import { useOptionalTheme } from '../presentation/react';
import { SemanticIcon } from './PixelIcon';

export type TrophyKind =
  'league' | 'cup' | 'continental' | 'final' | 'promotion' | 'relegation' | 'best';
export function TrophyIcon({ kind, earned = true }: { kind: TrophyKind; earned?: boolean }) {
  const theme = useOptionalTheme();
  return (
    <SemanticIcon
      size={56}
      resource={theme?.icon(`trophy.${kind}`, earned ? undefined : 'unearned')}
    />
  );
}
