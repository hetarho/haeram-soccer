/**
 * The counter measurement's inputs, side-effect free (T328, T331): counter 4-4-2 role tables
 * (`VARIANTS`) and candidate-model behaviour overrides (`BEHAVIOURS`). Importing this module changes
 * nothing; `scripts/t328-counter-roles.ts` applies the chosen table and overrides in its own process
 * before any squad, world or match is built.
 */
import type { Position, RoleId } from '../packages/contracts/src/player';
import { CHANGES_CONFIG } from '../packages/engine/src/grid/changes';
import { COORDINATION_CONFIG } from '../packages/engine/src/grid/coordination';
import { DECISION_CONFIG } from '../packages/engine/src/grid/decide';
import { SHAPE_CONFIG } from '../packages/engine/src/grid/shape';

export type SlotSpec = readonly [Position, RoleId];
const BASE: SlotSpec[] = [
  ['GK', 'shotStopper'],
  ['LB', 'defensiveFullBack'],
  ['CB', 'stopper'],
  ['CB', 'coverDefender'],
  ['RB', 'defensiveFullBack'],
  ['LM', 'wideMidfielder'],
  ['CM', 'boxToBox'],
  ['CM', 'deepLyingPlaymaker'],
  ['RM', 'wideMidfielder'],
  ['ST', 'targetMan'],
  ['ST', 'poacher'],
];
const swap = (changes: Record<number, SlotSpec>): SlotSpec[] => BASE.map((s, i) => changes[i] ?? s);
/** Counter 4-4-2 role tables from PLAYER-5's roles; slot order as STAFF-22 (GK, DF, MF, FW, left to right). */
export const VARIANTS: Record<string, SlotSpec[]> = {
  base: BASE,
  // A second runner instead of the target man.
  twoRunners: swap({ 9: ['ST', 'completeForward'] }),
  // A defensive-midfield screen instead of the box-to-box.
  screen: swap({ 6: ['DM', 'anchor'] }),
  // Wide midfielders as inside forwards who run in behind.
  insideForwards: swap({ 5: ['LW', 'invertedWinger'], 8: ['RW', 'invertedWinger'] }),
  // A box-arriving midfielder instead of the deep-lying playmaker.
  mezzala: swap({ 7: ['CM', 'mezzala'] }),
  // Screen behind, a mezzala and the box-to-box ahead.
  screenMezzala: swap({ 6: ['DM', 'anchor'], 7: ['CM', 'mezzala'] }),
  // screenMezzala with a second runner instead of the target man (twoRunners' change).
  screenMezzalaRunners: swap({
    6: ['DM', 'anchor'],
    7: ['CM', 'mezzala'],
    9: ['ST', 'completeForward'],
  }),
  widePlaymakers: swap({ 5: ['LM', 'widePlaymaker'], 8: ['RM', 'widePlaymaker'] }),
  // A ball-winning screen, a wide playmaker cutting in on the right and two runners up front.
  leicester: swap({
    6: ['DM', 'ballWinner'],
    8: ['RM', 'widePlaymaker'],
    9: ['ST', 'completeForward'],
  }),
  // Screen, two runners and inside forwards: the most direct 4-4-2 PLAYER-5 allows.
  direct: swap({
    5: ['LW', 'invertedWinger'],
    6: ['DM', 'anchor'],
    8: ['RW', 'invertedWinger'],
    9: ['ST', 'completeForward'],
  }),
};

/** A deep patch of the candidate configs, keyed by config. */
export interface BehaviourPatch {
  decide?: object;
  shape?: object;
  coordination?: object;
  changes?: object;
}

const settled = (forward: number, long: number, lateral: number, back: number): BehaviourPatch => ({
  decide: { direct: { settled: { counter: { forward, long, lateral, back } } } },
});
const counterShape = (shape: object): BehaviourPatch => ({
  shape: { candidate: { tactic: { counter: shape } } },
});
const pressDrain = (pressDrain: number): BehaviourPatch => ({
  changes: { candidate: { pressDrain } },
});

/**
 * T331's behaviour levers on the candidate model: (a) counter keeps going forward or long once its
 * break has passed, (b) counter's deep block, (c) press's in-match fatigue cost. Names join with
 * `+` on the command line; later patches win.
 */
export const BEHAVIOURS: Record<string, BehaviourPatch> = {
  none: {},
  // (a) Off-regain directness, mild to strong.
  settled1: settled(0.5, 0.3, 0.7, 0.5),
  settled2: settled(1, 0.5, 0.5, 0.35),
  settled3: settled(2, 1, 0.35, 0.25),
  // (b) Counter's block: deeper line, tighter, more pressers near the ball.
  deep: counterShape({ defend: -10, line: [18, 38] }),
  tight: counterShape({ compact: 0.2 }),
  deepTight: counterShape({ defend: -10, line: [18, 38], compact: 0.2 }),
  twoPress: { coordination: { pressers: { counter: 2 } } },
  noPress: counterShape({ press: 6 }),
  // (c) Press's in-match drain factor (1.3 shared).
  drain2: pressDrain(2),
  drain3: pressDrain(3),
  drain4: pressDrain(4),
};

function merge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    const t = target[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && t && typeof t === 'object')
      merge(t as Record<string, unknown>, v as Record<string, unknown>);
    else target[k] = v;
  }
}

/** Applies a patch to the live configs; call before any match is built. */
export function applyBehaviour(patch: BehaviourPatch): void {
  const targets: Record<keyof BehaviourPatch, object> = {
    decide: DECISION_CONFIG,
    shape: SHAPE_CONFIG,
    coordination: COORDINATION_CONFIG,
    changes: CHANGES_CONFIG,
  };
  for (const [k, v] of Object.entries(patch))
    merge(
      targets[k as keyof BehaviourPatch] as Record<string, unknown>,
      v as Record<string, unknown>,
    );
}

/** The patch a `--behaviour a+b` name list and an optional `--patch <json>` give, in order. */
export function behaviourOf(names: string, json?: string): BehaviourPatch[] {
  const out = names
    .split('+')
    .filter(Boolean)
    .map((n) => {
      const p = BEHAVIOURS[n];
      if (!p) throw new Error(`unknown behaviour ${n}`);
      return p;
    });
  if (json) out.push(JSON.parse(json) as BehaviourPatch);
  return out;
}
