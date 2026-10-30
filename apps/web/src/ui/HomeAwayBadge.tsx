import s from './HomeAwayBadge.module.css';
import { useLocale } from '../presentation/react';

export function HomeAwayBadge({ side }: { side: 'home' | 'away' }) {
  const { t } = useLocale();
  return (
    <span className={s.badge} data-ui="home-away-badge" data-side={side}>
      {t(`fixture.${side}`)}
    </span>
  );
}
