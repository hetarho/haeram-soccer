/** The live state of a grid match: where everyone stands and what each player's skills are worth now (→MATCH-11). */
import { ATTRIBUTES, type Attribute } from '../../../contracts/src/player';
import type { Player, Tactic } from '../../../contracts/src/types';
import { FORMATIONS, levelFactor, lineOf } from '../player';
import { HOST_MATH, PORTABLE_MATH, type MatchMath } from '../portable-math';
import { fatigueLoad, slotOvr, unhappyPenalty } from '../player-state';
import { matchModelNumber } from '../../../contracts/src/match-model';
import type { FreedomState } from './freedom';
import type { EndedIntention, Intention } from './intentions';
import { attackFrame, PITCH, type Point } from './pitch';
import type { GridSetup } from './setup';
import { SPOTS } from './spots';

export interface GridPlayer {
  side: 0 | 1;
  /** Roster index. */
  idx: number;
  player: Player;
  /** The formation slot he plays; -1 on the bench. */
  slot: number;
  /** Position in the engine frame (metres). */
  pos: [number, number];
  /** Velocity in m/s (engine frame) under the candidate model's bounded movement (`movement.ts`); absent at rest. */
  vel?: [number, number];
  onPitch: boolean;
  yellow: boolean;
  sentOff: boolean;
  injured: boolean;
  /** Match seconds since kick-off when he came on (0 for a starter). */
  onAt: number;
  offAt?: number;
  /** Regulation minutes when he came on and when he left. */
  onMin: number;
  offMin?: number;
  /** Attribute values at his slot before the day's shift and in-match drain; index = `ATTRIBUTES.indexOf(a)`. */
  base: Float64Array;
  /** A run under way; on the candidate model the view of his run intention, set and cleared with it. */
  run?: { kind: 'behind' | 'overlap' | 'box'; until: number; target: [number, number] };
  /** Candidate model only: his individual football intention (`intentions.ts`, →MATCH-17). */
  intention?: Intention;
  /** Candidate model only: the last intention that ended, and why. */
  ended?: EndedIntention;
}

export interface GridState {
  setup: GridSetup;
  /** Each side's formation slots and their spots, read once from its tactic (`setup.tactics`). */
  formation: [(typeof FORMATIONS)[Tactic]['slots'], (typeof FORMATIONS)[Tactic]['slots']];
  spots: [readonly Point[], readonly Point[]];
  players: [GridPlayer[], GridPlayer[]];
  ball: [number, number];
  owner?: [0 | 1, number];
  possession: 0 | 1;
  period: 1 | 2 | 3 | 4;
  /** Seconds within the period. */
  t: number;
  /** Match seconds since kick-off across periods. */
  elapsed: number;
  score: [number, number];
  lastRegain?: { side: 0 | 1; at: number };
  lastLoss?: { side: 0 | 1; at: number };
  /** Match seconds of the last delivered set piece's kick (`restartTaken`); revision 2's disorder reads it (T432). */
  setPieceAt?: number;
  /** Revision 2 only (T432): each side's freedom plan as last planned (`freedom.ts`); absent before it. */
  freedom?: FreedomState;
  /** The last completed pass, in the receiving side's attack frame; tags read the carrier's orientation from it. */
  lastPass?: { dx: number; dy: number };
  /**
   * The candidate model's receiver of the last completed pass until his first action on the ball
   * (T397): his first touch is a decision of its own (`DECISION_CONFIG.candidate.firstTouch`).
   */
  received?: [0 | 1, number];
  /** Match seconds when the possessing side got the ball. */
  possessionSince: number;
  /** Each side's substitutions and injuries so far (→MATCH-20, §8.1). */
  changes: [SideChanges, SideChanges];
  /** Counts every player entering a slot or leaving the pitch; revision 2's freedom plans re-read the lineup when it moves (T432). */
  lineups: number;
  /** The match's level: the mean 실효 OVR of both starting XIs at kick-off. */
  level: number;
  /** The duels' skill scale on this fixture's model (`STRENGTH_CONFIG`, T357). */
  scale: number;
  /**
   * Per side, the rating points of its distance from the level (its XI's mean 실효 OVR plus the
   * day's shift, minus the level) its players' skills leave out: `1 − STRENGTH_CONFIG.candidate.side`
   * of it on the candidate model, 0 on the pre-feature one (T357, T365).
   */
  pull: [number, number];
  /**
   * The transcendental functions this match's positions, distances and odds read, bound once at
   * kick-off (→ARCH-5, ARCH-9, T358): the portable ones on the candidate model, so its facts are
   * the same on every host, the host's `Math.*` on the pre-feature path, whose settled facts stay
   * as they were. Code both models share reads them here; candidate-only code (`movement.ts`,
   * `coordination.ts`) imports the portable ones itself.
   */
  math: MatchMath;
}

/** What a side has used of its changes and what is still owed at the next stoppage. */
export interface SideChanges {
  /** Substitutes used. */
  used: number;
  /** Stoppages other than half-time in which it substituted. */
  windows: number;
  /** Roster indexes of the substitutes in the order they came on. */
  entered: number[];
  /** Players hurt in play who have left and are not yet replaced. */
  injured: number[];
  /** Red cards shown, and how many of them the manager has answered (§8.1 step 2). */
  reds: number;
  rebalanced: number;
  /** One-off policy changes already made (STAFF-45). */
  protectedLead: boolean;
  chased: boolean;
  youthGiven: boolean;
  /** The data head coach's checkpoints passed (60′, 70′, 80′). */
  checkpoints: number;
}

const PERIOD_OFFSET = [0, 45, 90, 105] as const;
const PERIOD_LENGTH = [45, 45, 15, 15] as const;

/** Regulation minutes since kick-off, added time not counted. */
export function regMinute(s: GridState): number {
  return PERIOD_OFFSET[s.period - 1]! + Math.min(PERIOD_LENGTH[s.period - 1]!, s.t / 60);
}

/** Whether a player is on the pitch now (not on the bench, not sent off). */
export const onPitch = (gp: GridPlayer) => gp.onPitch && !gp.sentOff;
export const other = (side: 0 | 1) => (1 - side) as 0 | 1;
/** The formation slot of a player on the pitch. */
export const slotOf = (s: GridState, gp: GridPlayer) => s.formation[gp.side][gp.slot]!;

const HANDS: readonly Attribute[] = ['reflexes', 'handling'];

/** Fills `base` for a player at a slot (a bench player uses his own main position until he enters). */
function fillBase(setup: GridSetup, gp: GridPlayer, slot: number): void {
  const { player, side } = gp;
  const position =
    slot >= 0 ? FORMATIONS[setup.tactics[side]].slots[slot]!.position : player.position;
  const scale = levelFactor(player.positions, position) * setup.multiplier[side](player);
  const load = fatigueLoad(player.fatigue);
  const off = unhappyPenalty(player);
  ATTRIBUTES.forEach((a, i) => {
    gp.base[i] = player.attrs[a] * scale - load / (HANDS.includes(a) ? 10 : 8) - off;
  });
}

/** Where a starter stands at kick-off: his spot in his own half, in the engine frame. */
export function kickOffPoint(setup: GridSetup, side: 0 | 1, slot: number): [number, number] {
  const spot: Point = SPOTS[setup.tactics[side]][slot]!;
  const own: Point = [Math.min(spot[0], 50), spot[1]];
  const [x, y] = attackFrame(side, own);
  return [x, y];
}

/**
 * Puts the ball on the centre spot for `side` and every player on the pitch at his kick-off spot
 * (period starts and restarts after a goal). With `place` off the players stay where they are for
 * the candidate model to walk them there (→MATCH-12).
 */
export function kickOff(s: GridState, side: 0 | 1, place = true): void {
  for (const sd of [0, 1] as const)
    for (const gp of s.players[sd])
      if (gp.onPitch && gp.slot >= 0) {
        if (place) {
          gp.pos = kickOffPoint(s.setup, sd, gp.slot);
          if (gp.vel) gp.vel = undefined;
        }
        gp.run = undefined;
      }
  const slots = FORMATIONS[s.setup.tactics[side]].slots;
  const taker = s.players[side].find(
    (gp) => gp.onPitch && !gp.sentOff && gp.slot >= 0 && lineOf(slots[gp.slot]!.position) === 'FW',
  );
  const first = taker ?? s.players[side].find((gp) => gp.onPitch && !gp.sentOff && gp.slot > 0);
  s.ball = [PITCH.length / 2, PITCH.width / 2];
  s.possession = side;
  s.owner = first ? [side, first.idx] : undefined;
}

const noChanges = (): SideChanges => ({
  used: 0,
  windows: 0,
  entered: [],
  injured: [],
  reds: 0,
  rebalanced: 0,
  protectedLead: false,
  chased: false,
  youthGiven: false,
  checkpoints: 0,
});

export function createState(setup: GridSetup): GridState {
  const players = [0, 1].map((side) =>
    setup.rosters[side as 0 | 1].map((player, idx): GridPlayer => {
      const starter = idx < 11;
      const gp: GridPlayer = {
        side: side as 0 | 1,
        idx,
        player,
        slot: starter ? idx : -1,
        pos: starter
          ? kickOffPoint(setup, side as 0 | 1, idx)
          : [PITCH.length / 2, side === 0 ? 0 : PITCH.width],
        onPitch: starter,
        yellow: false,
        sentOff: false,
        injured: false,
        onAt: 0,
        onMin: 0,
        base: new Float64Array(ATTRIBUTES.length),
        // The fields a match sets later, present from the start: one object shape for every player,
        // so the reads of his fields stay monomorphic (JSON and `canonical` leave undefined out).
        vel: undefined,
        run: undefined,
        intention: undefined,
        ended: undefined,
        offAt: undefined,
        offMin: undefined,
      };
      fillBase(setup, gp, gp.slot);
      return gp;
    }),
  ) as [GridPlayer[], GridPlayer[]];
  const slots = FORMATIONS[setup.tactics[0]].slots;
  const taker = Math.max(
    0,
    slots.findIndex((s) => lineOf(s.position) === 'FW'),
  );
  let level = 0,
    starters = 0;
  const sideSum = [0, 0],
    sideCount = [0, 0];
  for (const side of [0, 1] as const)
    for (const gp of players[side].slice(0, 11)) {
      const ovr = slotOvr(
        gp.player,
        FORMATIONS[setup.tactics[side]].slots[gp.slot]!,
        setup.multiplier[side](gp.player),
      );
      level += ovr;
      starters++;
      sideSum[side] += ovr;
      sideCount[side]++;
    }
  const matchLevel = starters ? level / starters : 60;
  const C = STRENGTH_CONFIG;
  const candidate = setup.model !== undefined;
  // T357/T365: the share of each side's distance from the level (its XI's mean plus the day's
  // shift) its skills leave out, on the candidate model only; basic arithmetic, so the same on
  // every host (→ARCH-9).
  const leave = candidate ? 1 - C.candidate.side : 0;
  const pull = [0, 1].map((side) =>
    leave === 0
      ? 0
      : leave *
        ((sideCount[side]! ? sideSum[side]! / sideCount[side]! : matchLevel) +
          setup.shift[side as 0 | 1] -
          matchLevel),
  ) as [number, number];
  return {
    setup,
    formation: [FORMATIONS[setup.tactics[0]].slots, FORMATIONS[setup.tactics[1]].slots],
    spots: [SPOTS[setup.tactics[0]], SPOTS[setup.tactics[1]]],
    players,
    level: matchLevel,
    scale: candidate ? C.candidate.skillScale : C.skillScale,
    pull,
    ball: [PITCH.length / 2, PITCH.width / 2],
    owner: [0, taker],
    possession: 0,
    period: 1,
    t: 0,
    elapsed: 0,
    score: [0, 0],
    possessionSince: 0,
    changes: [noChanges(), noChanges()],
    lineups: 0,
    math: setup.model === undefined ? HOST_MATH : PORTABLE_MATH,
    // Revision 2's movement needs its per-match tendencies (T432).
    freedom:
      setup.tendencies && setup.model && matchModelNumber(setup.model) >= 2
        ? { plans: [] }
        : undefined,
    // The fields a match sets later, present from the start: one object shape for the state, so
    // the reads of its fields stay monomorphic.
    lastRegain: undefined,
    lastLoss: undefined,
    setPieceAt: undefined,
    lastPass: undefined,
    received: undefined,
  };
}

/** Match minutes a player has been on the pitch. */
export function minutesOn(s: GridState, gp: GridPlayer): number {
  return (s.elapsed - gp.onAt) / 60;
}

/**
 * How the duels feel a skill point (→MATCH-2, MATCH-22, T216): a skill counts by its distance from the
 * match's level, spread by `skillScale` around `anchor` — the level T215 set the distributions at — so a
 * strength gap plays the same at every tier.
 */
export const STRENGTH_CONFIG = {
  skillScale: 1.8,
  anchor: 76,
  /**
   * Candidate model only (T357, T365, →MATCH-2): its own `skillScale`, and the share of a side's
   * distance from the match's level — its XI's mean 실효 OVR plus the day's shift (form, home,
   * manager and morale points and the gap diminishing returns take away) — that reaches its
   * players' skills (`side`). At 1, as on the pre-feature model, favourites won 4–7 points too
   * often at every gap of 10 or more (curve error 3.09 on T357's rounds 21 and 22); 0.8 shrinks
   * every source of a strength point alike, so a point still counts the same wherever it comes
   * from, and leaves the spread inside a side as it was.
   */
  candidate: { skillScale: 1.8, side: 0.8 },
} as const;

/** A raw skill value on the duels' scale. */
export const strengthScaled = (s: GridState, raw: number) =>
  STRENGTH_CONFIG.anchor + (raw - s.level) * s.scale;

/** Each attribute's index in `ATTRIBUTES` (and so in `GridPlayer.base`). */
const ATTRIBUTE_INDEX = Object.fromEntries(ATTRIBUTES.map((a, i) => [a, i])) as Record<
  Attribute,
  number
>;

/** A player's attribute now: his base at the slot, the day's shift, minus what his minutes have drained. */
export function skill(s: GridState, side: 0 | 1, idx: number, a: Attribute): number {
  const gp = s.players[side][idx]!;
  const { setup } = s;
  const rate =
    (((100 - gp.player.attrs.stamina) / 12) *
      (setup.pressing[side] ? 1.3 : 1) *
      setup.drain[side]) /
    90;
  return strengthScaled(
    s,
    gp.base[ATTRIBUTE_INDEX[a]]! + setup.shift[side] - rate * minutesOn(s, gp) - s.pull[side],
  );
}

/** Puts a player into a slot and recomputes his base for it. */
export function enterSlot(s: GridState, gp: GridPlayer, slot: number): void {
  gp.slot = slot;
  s.lineups++;
  fillBase(s.setup, gp, slot);
}
