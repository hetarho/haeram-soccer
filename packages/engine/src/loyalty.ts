import type { Player } from '../../contracts/src/types';
import { LOYALTY_WEIGHT } from './player';

/** The shared loyalty term for staying at or leaving a club (→CLUB-53/54). */
export const LOYALTY = { perSeason: 0.15, cap: 1.5, graduate: 0.5 } as const;

export function loyaltyTerm(
  player: Pick<Player, 'personality' | 'joined' | 'graduate'>,
  year: number,
) {
  if ('freeSince' in player) return 0;
  const seasons = player.joined === undefined ? 0 : Math.max(0, year - player.joined);
  return (
    LOYALTY_WEIGHT[(player.personality.loyalty ?? 3) - 1]! *
    (Math.min(LOYALTY.cap, seasons * LOYALTY.perSeason) + (player.graduate ? LOYALTY.graduate : 0))
  );
}
