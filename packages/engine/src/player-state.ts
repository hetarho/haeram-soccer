/** Pure player/world reads shared by simulation and campaign orchestration. */
import type { Club, Line, Player, Tactic, World } from '../../contracts/src/types';
import {
  FORMATIONS,
  lineOf,
  mainOvr,
  adaptationMultiplier,
  ovrAt,
  levelFactor,
  type Slot,
} from './player';
import { dayCountedFrom } from './calendar';

const ownIndex = new WeakMap<readonly Club[], number>();
/** The owner's club: its place in the clubs array is remembered and checked on every call. */
export const clubOf = (w: Pick<World, 'clubs' | 'playerClub'>) => {
  const known = ownIndex.get(w.clubs);
  if (known !== undefined && w.clubs[known]?.id === w.playerClub) return w.clubs[known]!;
  const index = w.clubs.findIndex((c) => c.id === w.playerClub);
  ownIndex.set(w.clubs, index);
  return w.clubs[index]!;
};
export const activePlayers = (w: World) => w.players.filter((p) => p.status === 'active');
/** His OVR at his main position in his best role there (→PLAYER-6). */
export const overall = (p: Player) => Math.round(mainOvr(p));
/** His line: his main position's (→PLAYER-3). */
export const lineOfPlayer = (p: Player): Line => lineOf(p.position);
/** Points an unhappy player plays below his ability (→CLUB-27); his attributes stay as they are. */
export const UNHAPPY_PENALTY = 3;
export const unhappyPenalty = (p: Player) => (p.unhappy ? UNHAPPY_PENALTY : 0);
/** The ability a player plays at: his overall, less the unhappy penalty. */
export const playingAbility = (p: Player) => overall(p) - unhappyPenalty(p);
/** An own player plays at his adaptation's multiplier (→PLAYER-10). */
export const ownMultiplier = (p: Player) => adaptationMultiplier(p.adaptation);
/** A club nobody owns plays at its 조직력's multiplier (→LEAGUE-12). */
export const cohesionMultiplier = (c: Club) => adaptationMultiplier(c.cohesion ?? 0.8);
/**
 * 실효 OVR at a formation slot: his OVR there in its role × his level there × his multiplier, less
 * the unhappy penalty (→PLAYER-6).
 */
export function slotOvr(p: Player, slot: Slot, multiplier = 1) {
  return (
    ovrAt(p.attrs, slot.position, slot.role) *
      levelFactor(p.positions, slot.position) *
      multiplier -
    unhappyPenalty(p)
  );
}
export const formationOf = (tactic: Tactic) => FORMATIONS[tactic].slots;

export const FRESH_FATIGUE = 20;
export function fatigueLoad(fatigue: number) {
  return Math.max(0, fatigue - FRESH_FATIGUE);
}
/** Days until an injured player can play again (→CLUB-23); 0 when fit. */
export function injuryDaysLeft(w: World, p: Player) {
  return p.injury ? Math.max(0, p.injury.day - dayCountedFrom(w, p.injury.year)) : 0;
}
export function isInjured(w: World, p: Player) {
  return injuryDaysLeft(w, p) > 0;
}
