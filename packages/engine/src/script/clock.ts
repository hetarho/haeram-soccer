/** Nominal, portable match seconds; presentation staging owns its separate motion clock. */
import { SCRIPT_CONFIG as FIT, SCRIPT_CONFIG as GRAMMAR } from './config';
import { dist } from './cells';
import type { Beat, BeatKind } from './types';
const isRestartKind = (k: BeatKind) =>
  k === 'kickOff' || k === 'throwIn' || k === 'goalKick' || k === 'corner' || k === 'freeKick';
/** Nominal seconds a beat's ball travels (`grammar.speeds`); a foul has none. */
export const travel = (b: Beat): number => {
  const speeds = GRAMMAR.speeds;
  return b.outcome === 'foul'
    ? 0
    : dist(b.from, b.to) /
        (b.shot !== undefined
          ? speeds.shot
          : b.kind === 'carry' || b.kind === 'takeOn'
            ? speeds.carry
            : b.loft
              ? speeds.loft
              : speeds.ground);
};
/** Seconds the restart beat `b` (the `k`th of minute `m`) takes off its minute; a half's opening kick-off none. */
export const deadOf = (b: Beat, k: number, m: number): number =>
  isRestartKind(b.kind) &&
  !(k === 0 && b.kind === 'kickOff' && (m === 0 || m === 45 || m === 90 || m === 105))
    ? FIT.dead[b.kind as keyof typeof FIT.dead]
    : 0;
/**
 * A minute's clock before pressing: its sixty seconds less its restarts' dead time shared equally
 * between its beats as hold plus travel, each hold within `fit.hold`, and the seconds that needs.
 */
export function minuteTimes(list: readonly Beat[], m: number): { holds: number[]; need: number } {
  const dead = list.reduce((s, b, k) => s + deadOf(b, k, m), 0);
  const share = (60 - dead) / list.length;
  const holds = list.map((b) => Math.min(Math.max(share - travel(b), FIT.hold[0]), FIT.hold[1]));
  const need = list.reduce((s, b, k) => s + deadOf(b, k, m) + holds[k]! + travel(b), 0);
  return { holds, need };
}
