/** The own club's matchday picks before kick-off (→MATCH-18, MATCH-20, CLUB-6): set-piece takers and named substitutes. */
import type { Player, World } from '../../../contracts/src/types';
import { FORMATIONS, lineOf } from '../player';
import { activePlayers, isInjured, ownMultiplier, slotOvr } from '../player-state';
import type { EraRules } from './rules';

/** Roster indexes of the set-piece takers. */
export interface Takers {
  penalty: number;
  directFreeKick: number;
  corner: number;
}

/** Picks each taker from the XI by his key; the goalkeeper (index 0) takes none unless alone; ties go to the lower index. */
export function takersFor(xi: readonly Player[]): Takers {
  const best = (key: (p: Player) => number) => {
    let index = xi.length > 1 ? 1 : 0;
    for (let i = index + 1; i < xi.length; i++) if (key(xi[i]!) > key(xi[index]!)) index = i;
    return index;
  };
  return {
    penalty: best((p) => 0.6 * p.attrs.finishing + 0.4 * p.attrs.composure),
    directFreeKick: best((p) => 0.5 * p.attrs.finishing + 0.5 * p.attrs.crossing),
    corner: best((p) => p.attrs.crossing),
  };
}

/**
 * The own club's named substitutes: its active, fit, available players behind the XI, a keeper
 * first from three named, then by line in turn, each the best effective OVR at a slot of his line
 * in the applied formation (→CLUB-6).
 */
export function ownBench(
  w: World,
  xi: readonly Player[],
  era: EraRules,
  unavailable: (p: Player) => boolean = () => false,
): Player[] {
  if (era.named === 0) return [];
  const taken = new Set(xi);
  const slots = FORMATIONS[w.tactic].slots;
  const pool = activePlayers(w).filter((p) => !taken.has(p) && !isInjured(w, p) && !unavailable(p));
  // His best effective OVR over the slots of a line in the applied formation (no line: the goalkeeper's).
  const level = (p: Player, line?: string) =>
    slots.reduce(
      (best, slot, i) =>
        (line === undefined ? i === 0 : lineOf(slot.position) === line)
          ? Math.max(best, slotOvr(p, slot, ownMultiplier(p)))
          : best,
      -Infinity,
    );
  const bench: Player[] = [];
  const pick = (line?: string) => {
    let chosen: Player | undefined,
      value = -Infinity;
    for (const p of pool) {
      const v = level(p, line);
      if (v > value) [chosen, value] = [p, v];
    }
    if (!chosen) return false;
    pool.splice(pool.indexOf(chosen), 1);
    bench.push(chosen);
    return true;
  };
  if (era.named >= 3) pick();
  for (let line = 0; bench.length < era.named && pool.length; line++) {
    if (!pick(['DF', 'MF', 'FW'][line % 3])) break;
  }
  return bench;
}
