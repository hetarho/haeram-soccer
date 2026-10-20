import type { Score } from '../../../contracts/src/types';
import { clamp } from '../primitives';
import { SHOT_CONFIG } from './resolve';
import { onPitch, other, skill, type GridState } from './state';

/** One kick of a shoot-out (→MATCH-6). */
export interface ShootoutKick {
  side: 0 | 1;
  /** Player index on his side. */
  idx: number;
  scored: boolean;
}

/** A kicker's 0.6 슈팅 + 0.4 침착성, the order a manager lists his takers by. */
const kickerSkill = (s: GridState, side: 0 | 1, idx: number) =>
  0.6 * skill(s, side, idx, 'finishing') + 0.4 * skill(s, side, idx, 'composure');

/** The players still on the pitch, best kickers first and the goalkeeper last (design §8.4). */
export function takerOrder(s: GridState, side: 0 | 1) {
  const players = s.players[side].filter(onPitch);
  const keeper = players.filter((gp) => gp.slot === 0);
  const outfield = players
    .filter((gp) => gp.slot !== 0)
    .sort((a, b) => kickerSkill(s, side, b.idx) - kickerSkill(s, side, a.idx) || a.idx - b.idx);
  return [...outfield, ...keeper].map((gp) => gp.idx);
}

/** The chance a kick goes in: the in-match penalty formula of design §7.4. */
export function kickChance(s: GridState, side: 0 | 1, idx: number) {
  const C = SHOT_CONFIG.penalty;
  const foe = other(side);
  const keeper = s.players[foe].find((gp) => gp.slot === 0 && onPitch(gp)) ?? s.players[foe][0]!;
  return clamp(
    C.base + (kickerSkill(s, side, idx) - skill(s, foe, keeper.idx, 'reflexes')) / 300,
    C.min,
    C.max,
  );
}

/**
 * Kicks alternate, the home side first: five each, ending as soon as one side cannot be caught,
 * then sudden death in pairs. The takers come round again in the same order.
 */
export function playShootout(s: GridState, r: () => number) {
  const order = [takerOrder(s, 0), takerOrder(s, 1)] as const;
  const scored = [0, 0];
  const taken = [0, 0];
  const kicks: ShootoutKick[] = [];
  const kick = (side: 0 | 1) => {
    const list = order[side];
    const idx = list[taken[side]! % list.length]!;
    const goal = r() < kickChance(s, side, idx);
    taken[side]!++;
    if (goal) scored[side]!++;
    kicks.push({ side, idx, scored: goal });
  };
  for (let round = 0; round < 5; round++)
    for (const side of [0, 1] as const) {
      kick(side);
      const left = (who: 0 | 1) => 5 - taken[who]!;
      if (scored[0]! + left(0) < scored[1]! || scored[1]! + left(1) < scored[0]!)
        return { score: { home: scored[0]!, away: scored[1]! } as Score, kicks };
    }
  while (scored[0] === scored[1]) {
    kick(0);
    kick(1);
  }
  return { score: { home: scored[0]!, away: scored[1]! } as Score, kicks };
}
