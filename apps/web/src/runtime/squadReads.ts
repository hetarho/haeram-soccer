import type { Club } from '../../../../packages/contracts/src/types';
import { cohesionMultiplier } from '../../../../packages/engine/src/player-state';

/** The worker's actual XI rating; the fallback supports older prepared views. */
export function projectedClubRating(club: Club & { rating?: number }) {
  return club.rating ?? Math.round(club.strength * cohesionMultiplier(club));
}
