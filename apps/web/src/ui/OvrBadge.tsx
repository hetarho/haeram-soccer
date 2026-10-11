import s from './OvrBadge.module.css';

/** Card tiers football games use for an overall rating: bronze below 65, silver to 74, gold 75+. */
export function ovrTier(value: number) {
  return value >= 75 ? 'gold' : value >= 65 ? 'silver' : 'bronze';
}

/**
 * An overall rating as a rating-card chip: the big number, then the position or job under it.
 * `potential` adds the ceiling as a second, quieter number (players, managers and coaches).
 */
export function OvrBadge({
  value,
  role,
  potential,
  large = false,
}: {
  value: number;
  role?: string;
  potential?: number;
  large?: boolean;
}) {
  const chip = (
    <span className={`${s.ovr} ${large ? s.large : ''}`} data-tier={ovrTier(value)}>
      <b>
        <i className={s.label}>OVR </i>
        {value}
      </b>
      {role && <small>{role}</small>}
    </span>
  );
  if (potential === undefined) return chip;
  return (
    <span className={s.pair}>
      {chip}
      <span
        className={`${s.ovr} ${s.potential} ${large ? s.large : ''}`}
        data-tier={ovrTier(potential)}
      >
        <b>
          <i className={s.label}>잠재력 </i>
          {potential}
        </b>
        <small>POT</small>
      </span>
    </span>
  );
}
