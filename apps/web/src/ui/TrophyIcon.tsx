import { useOptionalTheme } from '../presentation/react';
import { SemanticIcon } from './PixelIcon';
import s from './TrophyIcon.module.css';

export type TrophyKind =
  'league' | 'cup' | 'continental' | 'final' | 'promotion' | 'relegation' | 'best';
export function TrophyIcon({
  kind,
  earned = true,
  variant,
}: {
  kind: TrophyKind;
  earned?: boolean;
  variant?: string;
}) {
  const theme = useOptionalTheme();
  const appearance = variant ?? (earned ? undefined : 'unearned');
  return (
    <span className={s.artwork} data-ui="trophy" data-earned={earned} aria-hidden="true">
      <SemanticIcon
        size={112}
        semanticRole={`trophy.${kind}`}
        variant={appearance}
        resource={theme?.icon(`trophy.${kind}`, appearance)}
      />
    </span>
  );
}
