/** Club Elo reads (→HIST-12): a leaf the UI may read (→ARCH-4). */
import type { Club, World } from '../../contracts/src/types';
import { clubOf } from './player-state';

/** A rough Club Elo from strength: one rating point is about 16 Elo points (→HIST-12). */
export function initialElo(strength: number) {
  return Math.round(1350 + (strength - 60) * 16);
}
export function eloOf(c: Club) {
  return c.elo ?? initialElo(c.strength);
}
/** The own club's place among every club of the world by Elo, 1 = best. */
export function eloRank(w: World) {
  const own = eloOf(clubOf(w));
  return w.clubs.filter((c) => c.id !== w.playerClub && eloOf(c) > own).length + 1;
}
