import type { Role } from '../../../../packages/contracts/src/types';
import s from './OvrBadge.module.css';

/** Card tiers football games use for an overall rating: bronze below 65, silver to 74, gold 75+. */
export function ovrTier(value: number) {
  return value >= 75 ? 'gold' : value >= 65 ? 'silver' : 'bronze';
}

/** A player's overall rating as a rating-card chip: the big number, then his position. */
export function OvrBadge({
  value,
  role,
  large = false,
}: {
  value: number;
  role?: Role;
  large?: boolean;
}) {
  return (
    <span className={`${s.ovr} ${large ? s.large : ''}`} data-tier={ovrTier(value)}>
      <b>
        <i className={s.label}>OVR </i>
        {value}
      </b>
      {role && <small>{role}</small>}
    </span>
  );
}
