/**
 * Player entity: naming a player and asking for his detail. The detail itself is the
 * `widgets/player-detail` host; anything that names a player uses `PlayerLink` or `openPlayer`.
 */
export { PlayerLink } from './ui/PlayerLink';
export { openPlayer, usePlayerDetail, type PlayerScope, type PlayerTarget } from './model/detail';
