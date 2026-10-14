import type { Club, World } from '../../../../packages/contracts/src/types';
import { cohesionMultiplier, rating } from '../../../../packages/engine/src/world';
import s from './OvrBadge.module.css';

/**
 * A club's overall rating: ours is the starting XI as home shows it, a rival's the XI its strength
 * holds at its 조직력 (→LEAGUE-12; building rival squads for every table row would cost a frame).
 */
export function clubOvr(w: World, club: Club) {
  return club.id === w.playerClub
    ? rating(w, club)
    : Math.round(club.strength * cohesionMultiplier(club));
}
/** A rival's 조직력 and what it does to its XI: "조직력 0.86 · ×1.03" (→LEAGUE-12, WEB-58). */
export function cohesionLine(club: Club) {
  return `조직력 ${(club.cohesion ?? 0.8).toFixed(2)} · ×${Number(cohesionMultiplier(club).toFixed(3))}`;
}
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
