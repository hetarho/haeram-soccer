import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { Club, World } from '../../../../../../packages/contracts/src/types';
import { cohesionMultiplier } from '../../../../../../packages/engine/src/player-state';
import { rating } from '../../../../../../packages/engine/src/world';
import { projectedClubRating } from '../../../runtime/squadReads';
import s from './OvrBadge.module.css';

/**
 * A club's overall rating: ours is read from our XI, a rival's actual XI rating is published by
 * the worker (→LEAGUE-12), so table rows never need the other clubs' players.
 */
export function clubOvr(w: World, club: Club) {
  return club.id === w.playerClub ? rating(w, club) : projectedClubRating(club);
}
/** A rival's 조직력 and what it does to its XI: "조직력 0.86 · ×1.03" (→LEAGUE-12, WEB-58). */
export function cohesionLine(club: Club) {
  return sourceMessage('copy.OvrBadge.9a31ef657c', {
    p0: (club.cohesion ?? 0.8).toFixed(2),
    p1: Number(cohesionMultiplier(club).toFixed(3)),
  });
}
/** Presentation-only rarity tiers shared by rating cards and table chips (WEB-91). */
export function ovrTier(value: number) {
  return value >= 85
    ? 'ruby'
    : value >= 75
      ? 'platinum'
      : value >= 65
        ? 'gold'
        : value >= 50
          ? 'silver'
          : 'bronze';
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
  useTextLocale();
  const chip = (
    <span className={`${s.ovr} ${large ? s.large : ''}`} data-tier={ovrTier(value)}>
      <b>
        <i className={s.label}>{richMessage('copy.OvrBadge.ab597740a9')}</i>
        {localizeValue(value)}
      </b>
      {localizeValue(role && <small>{localizeValue(role)}</small>)}
    </span>
  );
  if (potential === undefined) return chip;
  return (
    <span className={s.pair}>
      {localizeValue(chip)}
      <span
        className={`${s.ovr} ${s.potential} ${large ? s.large : ''}`}
        data-tier={ovrTier(potential)}
      >
        <b>
          <i className={s.label}>{richMessage('copy.OvrBadge.a83c179adc')}</i>
          {localizeValue(potential)}
        </b>
        <small>{richMessage('team.column.potential')}</small>
      </span>
    </span>
  );
}
