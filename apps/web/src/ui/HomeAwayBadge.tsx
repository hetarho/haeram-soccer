import { localizeValue, useTextLocale } from '../presentation/text';
import s from './HomeAwayBadge.module.css';
import { useLocale } from '../presentation/react';

export function HomeAwayBadge({ side }: { side: 'home' | 'away' }) {
  useTextLocale();
  const { t } = useLocale();
  return (
    <span className={s.badge} data-ui="home-away-badge" data-side={side}>
      {localizeValue(t(`fixture.${side}`))}
    </span>
  );
}
