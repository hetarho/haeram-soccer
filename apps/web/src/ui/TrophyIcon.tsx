import { useOptionalTheme } from '../presentation/react';
import { SemanticIcon } from './PixelIcon';
import s from './TrophyIcon.module.css';

export type TrophyKind =
  'league' | 'cup' | 'continental' | 'final' | 'promotion' | 'relegation' | 'best';
export function TrophyIcon({ kind, earned = true }: { kind: TrophyKind; earned?: boolean }) {
  const theme = useOptionalTheme();
  return (
    <span className={s.artwork} data-ui="trophy" data-earned={earned} aria-hidden="true">
      <SemanticIcon
        size={112}
        semanticRole={`trophy.${kind}`}
        variant={earned ? undefined : 'unearned'}
        resource={theme?.icon(`trophy.${kind}`, earned ? undefined : 'unearned')}
      />
    </span>
  );
}
