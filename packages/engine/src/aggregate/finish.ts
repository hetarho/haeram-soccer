/**
 * The end of an aggregate match (→MATCH-1, MATCH-6): each period's added minutes and a level tie's
 * shoot-out. Plain inputs only, so an own match's detail (script/build.ts) reads them without the
 * match orchestration in `engine.ts`, which re-exports both.
 */
import type { Incident, Score } from '../../../contracts/src/types';
import { ADDED_CONFIG } from '../grid/engine';
import { SHOT_CONFIG } from '../grid/resolve';
import { STRENGTH_CONFIG } from '../grid/state';
import { clamp } from '../primitives';
import { AGGREGATE_CONFIG } from './config';
import { onPitchAt, slotAt } from './participation';
import type {
  AggregateAttribute,
  AggregateInput,
  AggregateParticipation,
  AggregateShootoutKick,
  AggregateSide,
  AggregateStreams,
  AggregateTeamFacts,
} from './types';

/**
 * A level tie's shoot-out (→MATCH-6), the detailed engine's rule (grid/shootout.ts): the players
 * on the pitch at the end kick, best 0.6 슈팅 + 0.4 침착성 first and the keeper last, the home side
 * first, five each until one side cannot be caught, then sudden death in pairs with the takers
 * coming round again; each kick goes in at the in-match penalty chance against the keeper's 선방.
 * `kicks`, when given, receives every kick in order (T825); it changes no draw.
 */
export function aggregateShootout(
  input: AggregateInput,
  participation: AggregateParticipation,
  streams: AggregateStreams,
  kicks?: AggregateShootoutKick[],
): Score {
  const end = participation.length;
  const minute = end - 0.5;
  const skill = (side: AggregateSide, line: number, a: AggregateAttribute) =>
    input.access.skill(side, line, a, minute);
  const kicker = (side: AggregateSide, line: number) =>
    0.6 * skill(side, line, 'finishing') + 0.4 * skill(side, line, 'composure');
  const present = (side: AggregateSide) =>
    input.sides[side].lines
      .map((_, line) => line)
      .filter((line) => onPitchAt(participation, side, line, end));
  const keeperOf = (side: AggregateSide) =>
    present(side).find((line) => slotAt(participation, side, line, end) === 0) ?? present(side)[0]!;
  const order = ([0, 1] as const).map((side) => {
    const keeper = keeperOf(side);
    const outfield = present(side)
      .filter((line) => line !== keeper)
      .sort((a, b) => kicker(side, b) - kicker(side, a) || a - b);
    return [...outfield, keeper];
  });
  const P = SHOT_CONFIG.penalty;
  const chance = (side: AggregateSide, line: number) => {
    const foe: AggregateSide = side === 0 ? 1 : 0;
    const margin =
      (kicker(side, line) - skill(foe, keeperOf(foe), 'reflexes')) * STRENGTH_CONFIG.skillScale;
    return clamp(P.base + margin / 300, P.min, P.max);
  };
  const r = streams.draw('shootout');
  const scored = [0, 0],
    taken = [0, 0];
  const kick = (side: AggregateSide) => {
    const list = order[side]!;
    const line = list[taken[side]! % list.length]!;
    const goal = r() < chance(side, line);
    if (goal) scored[side]!++;
    taken[side]!++;
    kicks?.push({ side, line, scored: goal });
  };
  const score = (): Score => ({ home: scored[0]!, away: scored[1]! });
  for (let round = 0; round < 5; round++)
    for (const side of [0, 1] as const) {
      kick(side);
      const left = (who: AggregateSide) => 5 - taken[who]!;
      if (scored[0]! + left(0) < scored[1]! || scored[1]! + left(1) < scored[0]!) return score();
    }
  while (scored[0] === scored[1]) {
    kick(0);
    kick(1);
  }
  return score();
}

/**
 * Added minutes of each period played (→MATCH-1): the time its goals, substitutions, injuries,
 * cards and penalties took, at the detailed engine's credits and bounds (grid/engine.ts).
 */
export function aggregateAddedTime(
  facts: Pick<AggregateTeamFacts, 'length' | 'ledger'>,
  incidents: readonly Incident[],
): number[] {
  const periods = facts.length === 120 ? 4 : 2;
  const periodOf = (minute: number) =>
    minute <= 45 ? 0 : minute <= 90 ? 1 : minute <= 105 ? 2 : 3;
  const credits = [0, 0, 0, 0];
  const K = ADDED_CONFIG.credits;
  for (const side of facts.ledger.sides)
    for (const shot of side.shots) {
      if (shot.outcome === 'goal') credits[periodOf(shot.minute)]! += K.goal;
      if (shot.kind === 'penalty') credits[periodOf(shot.minute)]! += K.penalty;
    }
  for (const x of incidents)
    credits[periodOf(x.minute)]! +=
      x.kind === 'sub' ? K.sub : x.kind === 'injury' ? K.injury : K.card;
  return credits.slice(0, periods).map((credited, i) => {
    const seconds = credited + AGGREGATE_CONFIG.addedSeconds[i]!;
    const [lo, hi] = ADDED_CONFIG.bounds[i]!;
    return Math.min(hi, Math.max(lo, Math.ceil(seconds / 60)));
  });
}
