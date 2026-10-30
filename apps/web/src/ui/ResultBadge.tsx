import { useLocale } from '../presentation/react';
import s from './ResultBadge.module.css';

const outcomes = { 승: 'win', 무: 'draw', 패: 'loss' } as const;

export function ResultBadge({
  result,
  score,
}: {
  result: keyof typeof outcomes;
  score?: readonly [number, number];
}) {
  const { t } = useLocale();
  const outcome = outcomes[result];
  const scoreText = score ? `${score[0]}–${score[1]}` : undefined;
  return (
    <span
      className={s.badge}
      data-ui="result-badge"
      data-outcome={outcome}
      data-with-score={score ? '' : undefined}
      role="img"
      aria-label={`${t(`result.${outcome}.label`)}${scoreText ? ` ${scoreText}` : ''}`}
    >
      <strong className={s.mark}>{t(`result.${outcome}`)}</strong>
      {scoreText && (
        <span className={s.score} dir="ltr">
          {scoreText}
        </span>
      )}
    </span>
  );
}
