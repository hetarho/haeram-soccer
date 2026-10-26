/**
 * Positional freedom, situational disorder and position swaps on match-model revision 2 (→MATCH-17,
 * STAFF-46, PLAYER-26, T432). The formation is where a player starts from: with the ball the freer
 * a player is, the further the football takes his place from his slot — a full-back overlapping
 * beyond his winger, stepping into midfield in the build-up or going across to the far side, a
 * winger coming inside, a forward dropping into midfield — while a teammate covers the zone he
 * leaves and the rest defence holds. After a turnover, straight after a set piece and when behind
 * late the shape loosens for everyone, then re-forms. Free wingers swap flanks and a free
 * full-back and his winger rotate, each doing the other's job until they swap back.
 *
 * Only revision 2 reads it (`GridState.freedom`, set by `createState` when the fixture plays
 * revision 2 or later): it needs the setup's per-match tendencies, which no earlier revision
 * computes. It reads the state and changes nothing; the plan follows from the ball, the clock, the
 * score and the lineup alone, never from where the players stand, so it is the same whoever asks.
 * Swaps draw streams named by the fixture, the side, the pair and its block of the match (→ARCH-5).
 */
import type { Position } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { FORMATIONS } from '../player';
import { random } from '../primitives';
import { PITCH } from './pitch';
import { SPOTS } from './spots';
import { onPitch, other, regMinute, type GridState } from './state';

/**
 * How far freedom takes a player from his slot with the ball (→MATCH-17, STAFF-46). T432 measured
 * 20–40 observed revision-2 fixtures a tactic against revision 1 (160 each, the same fixtures):
 * freedom is 0.14–0.75 in play (wingers and full-backs below 0.6 even under a flexible manager),
 * so at the starting 25 m a full-back's place moved about 6 m and nothing showed (a full-back in the
 * far half in 53% of matches, 51% on revision 1); 60 m shows it — 91% of matches, 7% with him on
 * the far wing lane (0% on revision 1) — with goals 2.46 → 2.72 and xG 2.48 → 2.66 a match.
 */
export const FREEDOM_CONFIG = {
  /** Metres at freedom 1; a player moves `drift` × his freedom at most. */
  drift: 60,
  /** Shares of that drift each move takes. */
  overlap: 1,
  across: 1,
  acrossUp: 0.3,
  stepIn: 0.5,
  inside: 0.6,
  drop: 0.6,
  /** Metres a move must take him from his slot to leave its zone for a teammate to cover. */
  vacated: 6,
  /** The share of the way to the vacated zone the teammate who covers it goes. */
  cover: 0.6,
  /** The ball this many metres off the centre line is on a flank. */
  wide: 10,
  /** Below this (his attack frame) his side is in its build-up; from `attack` on it is in the other half. */
  buildUp: 45,
  attack: 52.5,
} as const;

/**
 * How the shape loosens (→MATCH-17's situational disorder). T432 kept the starting values: on its
 * 160 fixtures at drift 60, loosen 0 gave 2.49 goals a match, 0.4 2.72 and 0.6 2.67 — the chances
 * come from the transitions it leaves open.
 */
export const DISORDER_CONFIG = {
  /** The share of a player's distance from his place his target keeps while the shape is loose. */
  loosen: 0.4,
  /** Seconds after a turnover or a set piece's kick the shape takes to re-form. */
  reform: 6,
  /** From this regulation minute a side behind plays loose until it is level. */
  late: 75,
} as const;

/**
 * When free players swap (→MATCH-17's position swaps). At the starting threshold 0.6 no winger or
 * full-back ever qualified (their roles' creativity caps them near 0.57, `TENDENCY_CONFIG`); at 0.35
 * T432's fixtures held 1.09 eligible pairs a match.
 */
export const SWAP_CONFIG = {
  /** Both players' freedom must exceed it. */
  threshold: 0.35,
  /** Match seconds a swap lasts; a pair decides afresh each block. */
  block: 600,
  /** The chance an eligible pair swaps for a block. */
  chance: 0.5,
} as const;

const FC = FREEDOM_CONFIG;
const CENTRE = PITCH.width / 2;

/** One side's plan at one moment: per roster index the slot whose job he plays and his offset from its place. */
export interface FreedomPlan {
  /** The slot whose spot, role and line he plays (his own unless he has swapped; -1 on the bench). */
  job: number[];
  /** Metres added to his place, in his side's attack frame (0 out of possession). */
  dx: Float64Array;
  dy: Float64Array;
}

/** A formation's slots by what freedom does with them, read once per tactic. */
interface Layout {
  backs: number[];
  wide: number[];
  strikers: number[];
  cbs: number[];
  /** Who covers a full-back's zone first: holding midfielders, then central ones. */
  holders: number[];
  centrals: number[];
  /** Who covers a dropping striker's: attacking midfielders, then wingers. */
  attackers: number[];
  /** Per slot: +1 on the left (toward the centre is up), −1 on the right. */
  inward: number[];
  /** Per wide slot: the full-back on its flank, or −1. */
  backOf: number[];
  threeBacks: boolean;
  /** The swap pairs: both wingers, then each full-back with the winger on his flank (−1 if none). */
  wingers: [number, number];
  flanks: [number, number, string][];
}
const LAYOUTS = new Map<Tactic, Layout>();
function layoutOf(tactic: Tactic): Layout {
  let l = LAYOUTS.get(tactic);
  if (l) return l;
  const slots = FORMATIONS[tactic].slots;
  const spots = SPOTS[tactic];
  const of = (positions: readonly Position[]) =>
    slots.flatMap((slot, k) => (positions.includes(slot.position) ? [k] : []));
  const left = (k: number) => spots[k]![1] < CENTRE;
  const find = (positions: readonly Position[]) =>
    slots.findIndex((slot) => positions.includes(slot.position));
  const backs = of(['LB', 'RB', 'LWB', 'RWB']);
  const wide = of(['LW', 'RW', 'LM', 'RM']);
  const lw = find(['LW', 'LM']),
    rw = find(['RW', 'RM']);
  l = {
    backs,
    wide,
    strikers: of(['ST']),
    cbs: of(['CB']),
    holders: of(['DM']),
    centrals: of(['CM']),
    attackers: [...of(['AM']), ...wide],
    inward: spots.map((_, k) => (left(k) ? 1 : -1)),
    backOf: spots.map((_, k) =>
      wide.includes(k) ? (backs.find((b) => left(b) === left(k)) ?? -1) : -1,
    ),
    threeBacks: of(['CB']).length >= 3,
    wingers: [lw, rw],
    flanks: [
      [find(['LB']), lw, 'left'],
      [find(['RB']), rw, 'right'],
    ],
  };
  LAYOUTS.set(tactic, l);
  return l;
}

interface Planned {
  /** The situation it was planned for (`situationOf`), the swaps' block and the lineup. */
  situation: number;
  lineup: number;
  plan: FreedomPlan;
  /** The roster index in each slot, and the player playing each slot's job; −1 for none. */
  held: number[];
  jobs: number[];
  /** The swaps' block and lineup, and slot → the slot whose job its player plays. */
  block: number;
  swapLineup: number;
  swaps: Map<number, number>;
}
/**
 * A match's freedom state (`GridState.freedom`): present only on revision 2 or later with its
 * per-match tendencies (`createState`), so the earlier paths pay one property read.
 */
export interface FreedomState {
  plans: [Planned?, Planned?];
}

/** The freedom his manager gives `idx` of `side` (→STAFF-46), 0 without revision 2's tendencies. */
export function freedomOf(s: GridState, side: 0 | 1, idx: number): number {
  return s.setup.tendencies?.[side][idx]?.freedom ?? 0;
}

/**
 * The lineup's version: it moves with every entry into a slot and every exit, so a plan never keeps
 * a player who has left whenever it was last asked for (an observed match asks more often, →MATCH-7).
 */
const lineupOf = (s: GridState) => s.lineups;

/**
 * The slots whose players swap jobs in the current block (→MATCH-17): the two wingers of a shape
 * with both flanks swap flanks, else a full-back and the winger on his flank rotate, each pair only
 * when both are on the pitch and free beyond `SWAP_CONFIG.threshold`, by a draw of its own.
 */
function swapsOf(s: GridState, side: 0 | 1, p: Planned, l: Layout): Map<number, number> {
  const block = Math.floor(s.elapsed / SWAP_CONFIG.block);
  if (p.block === block && p.swapLineup === p.lineup) return p.swaps;
  const map = new Map<number, number>();
  const held = p.held;
  const free = (slot: number) =>
    slot >= 0 && held[slot]! >= 0 && freedomOf(s, side, held[slot]!) > SWAP_CONFIG.threshold;
  const { w, f } = s.setup;
  const draws = (pair: string) =>
    random(`${w.seed}:${f.id}:swap:${side}:${pair}:${block}`)() < SWAP_CONFIG.chance;
  const swap = (a: number, b: number) => {
    map.set(a, b);
    map.set(b, a);
  };
  const [lw, rw] = l.wingers;
  if (free(lw) && free(rw) && draws('wingers')) swap(lw, rw);
  else
    for (const [back, winger, name] of l.flanks)
      if (free(back) && free(winger) && draws(name)) swap(back, winger);
  p.block = block;
  p.swapLineup = p.lineup;
  p.swaps = map;
  return map;
}

/**
 * `side`'s freedom plan now, undefined before revision 2 (→MATCH-17, T432). With the ball, each
 * free player's place moves by up to `FREEDOM_CONFIG.drift` × his freedom where the football calls
 * for it; of a back four's full-backs and of two strikers only the freer one goes, so the rest
 * defence holds; a full-back who leaves his zone has it covered by the nearest holding or central
 * midfielder (by a centre-back in the build-up), a dropping striker's by the attacking midfielder
 * or a winger. Swapped players play each other's slot in both phases. The plan is reused until the
 * ball, the clock, possession or the lineup changes; callers read it at once.
 */
export function freedomPlan(s: GridState, side: 0 | 1): FreedomPlan | undefined {
  const plans = s.freedom?.plans;
  if (!plans) return undefined;
  const situation = situationOf(s, side);
  const lineup = lineupOf(s);
  let p = plans[side];
  if (p && p.situation === situation && p.lineup === lineup) return p.plan;
  const roster = s.players[side];
  const l = layoutOf(s.setup.tactics[side]);
  if (!p) {
    const n = roster.length;
    p = {
      situation: -1,
      lineup: -1,
      plan: { job: [], dx: new Float64Array(n), dy: new Float64Array(n) },
      held: l.inward.map(() => -1),
      jobs: l.inward.map(() => -1),
      block: -1,
      swapLineup: -1,
      swaps: new Map(),
    };
    plans[side] = p;
  }
  const { plan, held, jobs } = p;
  if (p.lineup !== lineup) {
    held.fill(-1);
    for (const gp of roster) if (onPitch(gp) && gp.slot >= 0) held[gp.slot] = gp.idx;
  }
  p.situation = situation;
  p.lineup = lineup;
  for (let i = 0; i < roster.length; i++) plan.job[i] = roster[i]!.slot;
  jobs.fill(-1);
  for (let k = 0; k < held.length; k++) if (held[k]! >= 0) jobs[k] = held[k]!;
  for (const [a, b] of swapsOf(s, side, p, l))
    if (held[a]! >= 0) {
      plan.job[held[a]!] = b;
      jobs[b] = held[a]!;
    }
  plan.dx.fill(0);
  plan.dy.fill(0);
  if (s.possession === side) move(s, side, l, jobs, plan, situation);
  return plan;
}

/**
 * What a side's plan reads of the moment, as one number: the swaps' block, whether it has the ball
 * and, with it, the ball's zone in its attack frame — build-up, the other half, a flank and which.
 * The plan is the same for every moment with the same number.
 */
function situationOf(s: GridState, side: 0 | 1): number {
  const block = Math.floor(s.elapsed / SWAP_CONFIG.block);
  if (s.possession !== side) return block * 32;
  const bx = side === 0 ? s.ball[0] : PITCH.length - s.ball[0];
  const by = side === 0 ? s.ball[1] : PITCH.width - s.ball[1];
  return (
    block * 32 +
    16 +
    (bx < FC.buildUp ? 8 : 0) +
    (bx >= FC.attack ? 4 : 0) +
    (Math.abs(by - CENTRE) >= FC.wide ? 2 : 0) +
    (by < CENTRE ? 1 : 0)
  );
}

/**
 * The in-possession offsets of `freedomPlan` in the ball's zone `situation` (`situationOf`); `at`
 * is the player playing each slot's job.
 */
function move(
  s: GridState,
  side: 0 | 1,
  l: Layout,
  at: readonly number[],
  plan: FreedomPlan,
  situation: number,
): void {
  const spots = SPOTS[s.setup.tactics[side]];
  const ballWide = (situation & 2) !== 0;
  const ballLeft = (situation & 1) !== 0;
  const { dx, dy } = plan;
  const drift = (idx: number) => FC.drift * freedomOf(s, side, idx);
  const sameFlank = (k: number) => ballWide && (l.inward[k] === 1) === ballLeft;
  const build = (situation & 8) !== 0,
    attack = (situation & 4) !== 0;
  // Full-backs: into midfield in the build-up, beyond the winger on the ball's flank, across to it.
  for (const k of l.backs) {
    const idx = at[k]!;
    if (idx < 0) continue;
    const d = drift(idx);
    if (build) dy[idx] = l.inward[k]! * FC.stepIn * d;
    else if (attack && sameFlank(k)) dx[idx] = FC.overlap * d;
    else if (attack && ballWide) {
      dx[idx] = FC.acrossUp * d;
      dy[idx] = l.inward[k]! * FC.across * d;
    }
  }
  if (!l.threeBacks) keepFreer(s, side, plan, sameFlank, at, l.backs);
  // Wingers: inside with the ball on the other flank or in the middle, or when his full-back overlaps.
  if (attack)
    for (const k of l.wide) {
      const idx = at[k]!;
      if (idx < 0) continue;
      const back = l.backOf[k]!;
      const overlapped = back >= 0 && at[back]! >= 0 && dx[at[back]!]! >= FC.vacated;
      if (!sameFlank(k) || overlapped) dy[idx] = l.inward[k]! * FC.inside * drift(idx);
    }
  // Strikers: into midfield in the build-up, the freer of two.
  if (build) {
    for (const k of l.strikers) if (at[k]! >= 0) dx[at[k]!] = -FC.drop * drift(at[k]!);
    keepFreer(s, side, plan, () => false, at, l.strikers);
  }
  // The zones they leave: the nearest teammate still in his place covers, by his slot's width.
  const nearest = (from: number, candidates: readonly number[]) => {
    let best = -1,
      gap = Infinity;
    for (const k of candidates) {
      const idx = at[k]!;
      if (idx < 0 || dx[idx] !== 0 || dy[idx] !== 0) continue;
      const g = Math.abs(spots[k]![1] - spots[from]![1]);
      if (g < gap) [best, gap] = [k, g];
    }
    return best;
  };
  const cover = (from: number, mate: number, share: number) => {
    if (mate < 0) return;
    dx[at[mate]!] = (spots[from]![0] - spots[mate]![0]) * share;
    dy[at[mate]!] = (spots[from]![1] - spots[mate]![1]) * share;
  };
  if (!l.threeBacks)
    for (const k of l.backs) {
      const idx = at[k]!;
      if (idx < 0 || Math.abs(dx[idx]!) + Math.abs(dy[idx]!) < FC.vacated) continue;
      if (build) {
        // A centre-back slides out toward the touchline behind a full-back stepping in.
        const cb = nearest(k, l.cbs);
        if (cb >= 0) dy[at[cb]!] = -l.inward[k]! * FC.cover * Math.abs(dy[idx]!) * 0.5;
      } else {
        const holder = nearest(k, l.holders);
        cover(k, holder >= 0 ? holder : nearest(k, l.centrals), FC.cover);
      }
    }
  if (build)
    for (const k of l.strikers) {
      const idx = at[k]!;
      if (idx >= 0 && -dx[idx]! >= FC.vacated) cover(k, nearest(k, l.attackers), FC.cover / 2);
    }
}

/**
 * Of the players of `side` playing `jobs` (slots; `at` gives each one's player), only the freer
 * one keeps his move, the one on the ball's flank among equals, then the lower slot; the others
 * hold their places.
 */
function keepFreer(
  s: GridState,
  side: 0 | 1,
  plan: FreedomPlan,
  sameFlank: (slot: number) => boolean,
  at: readonly number[],
  jobs: readonly number[],
): void {
  const { dx, dy } = plan;
  let kept = -1,
    moving = 0;
  for (const k of jobs) {
    const idx = at[k]!;
    if (idx < 0 || (dx[idx] === 0 && dy[idx] === 0)) continue;
    moving++;
    if (kept < 0) {
      kept = k;
      continue;
    }
    const a = freedomOf(s, side, idx),
      b = freedomOf(s, side, at[kept]!);
    if (a > b || (a === b && sameFlank(k) && !sameFlank(kept))) kept = k;
  }
  if (moving < 2) return;
  for (const k of jobs) {
    const idx = at[k]!;
    if (idx >= 0 && k !== kept) dx[idx] = dy[idx] = 0;
  }
}

/**
 * The share of his distance from his place a player of `side` keeps in his target now
 * (→MATCH-17's situational disorder): `DISORDER_CONFIG.loosen` straight after a turnover or a set
 * piece's kick, fading to 0 over `reform` seconds, and for a side behind from the `late` minute on.
 * 0 before revision 2.
 */
export function looseness(s: GridState, side: 0 | 1): number {
  if (!s.freedom) return 0;
  const D = DISORDER_CONFIG;
  if (s.score[side] < s.score[other(side)] && regMinute(s) >= D.late) return D.loosen;
  const fade = (at: number | undefined) => {
    if (at === undefined) return 0;
    const age = s.elapsed - at;
    return age >= 0 && age < D.reform ? 1 - age / D.reform : 0;
  };
  return D.loosen * Math.max(fade(s.lastLoss?.at), fade(s.setPieceAt));
}
