/**
 * The counter measurement's inputs, side-effect free (T328, T334): counter 4-4-2 role tables
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

const settled = (
  forward: number,
  long: number,
  lateral: number,
  back: number,
  pass = 1,
): BehaviourPatch => ({
  decide: { direct: { settled: { counter: { forward, long, lateral, back, pass } } } },
});
const counterShape = (shape: object): BehaviourPatch => ({
  shape: { candidate: { tactic: { counter: shape } } },
});

/**
 * T334's behaviour levers on the candidate model: (a) counter keeps going forward or long once its
 * break has passed, (b) counter's deep block, (c) press's in-match fatigue cost; T336's from T334's
 * kept setting (T336's kept combination is in the shared config since; `t334` undoes it). Names
 * join with `+` on the command line; later patches win.
 */
export const BEHAVIOURS: Record<string, BehaviourPatch> = {
  none: {},
  // T336: the settings before T334 kept counter's settled play (no settled rule, line 22–42).
  preT334: {
    ...settled(0, 0, 1, 1, 1),
    ...counterShape({ line: [22, 42], upfield: 0.3 }),
  },
  // T336: T334's kept settings (the settled weights everywhere, the block following the ball).
  t334: {
    decide: { direct: { settled: { counter: { upTo: 105 } } } },
    ...counterShape({ upfield: 0.3 }),
  },
  // (a) Off-regain directness, mild to strong.
  settled1: settled(0.5, 0.3, 0.7, 0.5),
  settled2: settled(1, 0.5, 0.5, 0.35),
  settled3: settled(2, 1, 0.35, 0.25),
  // (a) with fewer passes against carrying on once settled.
  settled2p8: settled(1, 0.5, 0.5, 0.35, 0.8),
  settled2p65: settled(1, 0.5, 0.5, 0.35, 0.65),
  settled75: settled(1, 0.5, 0.5, 0.35, 0.75),
  // Without the long-ball pull, so fewer balls land upfield as loose balls counter wins high.
  settledShort75: settled(1, 0, 0.5, 0.35, 0.75),
  // (b) Counter's block: deeper line, tighter, more pressers near the ball.
  deep: counterShape({ defend: -10, line: [18, 38] }),
  tight: counterShape({ compact: 0.2 }),
  deepTight: counterShape({ defend: -10, line: [18, 38], compact: 0.2 }),
  twoPress: { coordination: { pressers: { counter: 2 } } },
  noPress: counterShape({ press: 6 }),
  high: counterShape({ defend: -5, line: [26, 46] }),
  wide: counterShape({ press: 15 }),
  // Within MATCH-8's shape order (counter below balanced's −6 and 24–45).
  line26: counterShape({ line: [26, 42] }),
  mid: counterShape({ defend: -7, line: [24, 44] }),
  line28: counterShape({ line: [28, 42] }),
  line24: counterShape({ line: [24, 42] }),
  line25: counterShape({ line: [25, 42] }),
  // T336 levers from T334's kept setting (settled75 + line24 in the shared config).
  // (a) where the settled rule applies and (c) counter's drop upfield were measured at 4f9d737b
  // through candidate hooks (`settled.counter.upTo`/`passUpTo`, `upfield`/`upfieldSeconds` on
  // counter's candidate shape); their combination (pass weights up to 70 m, `upfield` 0) is now
  // the shared candidate config (the coordinator's exception to T336's keep rule).
  // (b) The settled pass factor against the forward and long weights.
  fwd15p85: settled(1.5, 0.25, 0.5, 0.35, 0.85),
  // (d) Press's pressing height: its block and line higher without the ball.
  pressHigh: { shape: { candidate: { tactic: { press: { defend: 7, line: [32, 60] } } } } },
  // (e) Balanced's block against counter's settled play: a lower line top and a deeper block.
  balLow: { shape: { candidate: { tactic: { balanced: { defend: -7, line: [24, 43] } } } } },
  // T345 levers from T336's kept setting. (a) Possession's chance quality from settled play:
  // shooting from the box edge like the others (`shotBand5` 0.8 → 1), fewer passes against
  // carrying on and shooting, and a final-third rule (forward balls into the box, fewer back and
  // lateral passes past `from` m) through the settled-play hook.
  possEdge: possession({ shotBand5: 1 }),
  possEdgeTake: possession({ shotBand5: 1, takeOn: 1 }),
  possPass1: possession({ pass: 1 }),
  possFinal: possessionSettled({ forward: 1, lateral: 0.7, back: 0.5, from: 70 }),
  possFinalStrong: possessionSettled({ forward: 1.5, lateral: 0.6, back: 0.35, from: 65 }),
  // (b) Possession's rest defence after a loss: a longer counter-press reach, or a deeper block.
  possCP24: possessionShape({ counterPress: 24 }),
  possCP12: possessionShape({ counterPress: 12 }),
  possDeep: possessionShape({ defend: -4 }),
  // (c) T334's and T336's counter changes one at a time, for the gap −10 underdog.
  noSettled: settled(0, 0, 1, 1, 1),
  line22: counterShape({ line: [22, 42] }),
  follow: counterShape({ upfield: 0.3 }),
  // (c) The score state, every tactic: a leading side shoots less and a trailing one pushes more,
  // so more matches come back to a draw and fewer favourites run away with them.
  scoreFx: { decide: { leading: { shot: 0.5 }, trailing: { push: 1.6 } } },
  // (d) Balanced's block for its xG conceded: the pre-T321 counter-press reach, a tighter block.
  balCP8: { shape: { candidate: { tactic: { balanced: { counterPress: 8 } } } } },
  balTight: { shape: { candidate: { tactic: { balanced: { compact: 0.41 } } } } },
};

function possession(p: object): BehaviourPatch {
  return { decide: { tactic: { possession: p } } };
}
function possessionSettled(p: object): BehaviourPatch {
  return { decide: { direct: { settled: { possession: p } } } };
}
function possessionShape(p: object): BehaviourPatch {
  return { shape: { candidate: { tactic: { possession: p } } } };
}

function merge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in target)) throw new Error(`behaviour patch names a missing setting: ${k}`);
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
