import { localizeValue, useTextLocale } from '../../presentation/text';
import { useLocale } from '../../presentation/react';
import s from './ResultBadge.module.css';

const outcomes = { 승: 'win', 무: 'draw', 패: 'loss' } as const;

export function ResultBadge({
  result,
  score,
}: {
  result: keyof typeof outcomes;
  score?: readonly [number, number];
}) {
  useTextLocale();
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
      aria-label={localizeValue(
        `${t(`result.${outcome}.label`)}${scoreText ? ` ${scoreText}` : ''}`,
      )}
    >
      <strong className={s.mark}>{localizeValue(t(`result.${outcome}`))}</strong>
      {localizeValue(
        scoreText && (
          <span className={s.score} dir="ltr">
            {localizeValue(scoreText)}
          </span>
        ),
      )}
    </span>
  );
}
