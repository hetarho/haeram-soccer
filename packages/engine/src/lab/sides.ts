/**
 * The match lab's generated sides (→LAB-2): a full modern matchday squad for a tactic, every player
 * made as the game makes one at his OVR, position and role. Measurement tooling: nothing in play
 * reads it.
 */
import type { Player, Position, Tactic } from '../../../contracts/src/types';
import type { RoleId } from '../../../contracts/src/player';
import { clamp, integer, random } from '../primitives';
import { FORMATIONS, lineOf } from '../player';
import { eraRules } from '../grid/rules';
import { makePlayer, PRESS_LOAD_FATIGUE, squadPlaces } from '../world';

export const LAB_CONFIG = {
  /** The season whose rules a lab match plays (→MATCH-20's named substitutes, cards). */
  year: 2024,
  averageRange: [40, 90] as const,
  spreadRange: [0, 15] as const,
  /** The OVRs the game's generator lands on exactly (below 20 it floors at 15, above 92 it tops out near 95). */
  ovrRange: [20, 92] as const,
  /** Ages are drawn from the side's seed within this range. */
  ageRange: [20, 31] as const,
};

export type LabSideIndex = 0 | 1;

export interface LabSide {
  seed: string;
  tactic: Tactic;
  average: number;
  spread: number;
  /** Each place's OVR, starters in slot order then the bench; the players are made at these. */
  ovrs: number[];
  players: Player[];
}

export interface LabSideInput {
  side: LabSideIndex;
  seed: string;
  tactic: Tactic;
  average: number;
  spread: number;
}

/** The places of a lab squad: the formation's slots, then the era's named substitutes. */
export function labPlaces(tactic: Tactic): { position: Position; role?: RoleId }[] {
  const places = squadPlaces(tactic);
  const named = eraRules(LAB_CONFIG.year).named;
  const slots = FORMATIONS[tactic].slots;
  const outfield = slots.filter((s) => lineOf(s.position) !== 'GK');
  // squadPlaces fills the lines' minimums; further substitutes take the outfield slots in turn.
  for (let k = 0; places.length < slots.length + named; k++)
    places.push({ position: outfield[k % outfield.length]!.position });
  return places.slice(0, slots.length + named);
}

const ageOf = (seed: string, side: LabSideIndex, index: number) =>
  integer(random(`${seed}:lab-age:${side}:${index}`), ...LAB_CONFIG.ageRange);

function labPlayer(input: LabSideInput, index: number, ovr: number): Player {
  const place = labPlaces(input.tactic)[index]!;
  const p = makePlayer(
    'ENG',
    input.seed,
    `lab:${input.side}:${index}`,
    LAB_CONFIG.year,
    ovr,
    place.position,
    ageOf(input.seed, input.side, index),
    0,
    place.role,
  );
  p.adaptation = 1;
  // A pressing side carries the load a club nobody owns carries for it (`npcSquad`), so the lab's
  // press costs what it costs in the world's matches.
  p.fatigue = input.tactic === 'press' ? PRESS_LOAD_FATIGUE : 0;
  return p;
}

/**
 * A side at `average` with every OVR drawn within `spread` of it, the starters then shifted so their
 * mean is the average; the same input gives the same side.
 */
export function generateLabSide(input: LabSideInput): LabSide {
  const [lo, hi] = LAB_CONFIG.ovrRange;
  const average = clamp(Math.round(input.average), ...LAB_CONFIG.averageRange);
  const spread = clamp(Math.round(input.spread), ...LAB_CONFIG.spreadRange);
  const r = random(`${input.seed}:lab-ovr:${input.side}:${input.tactic}`);
  const places = labPlaces(input.tactic);
  const starters = FORMATIONS[input.tactic].slots.length;
  const drawn = places.map(() => average + (r() * 2 - 1) * spread);
  const mean = drawn.slice(0, starters).reduce((a, b) => a + b, 0) / starters;
  const shifted = drawn.map((v, i) => (i < starters ? v + average - mean : v));
  const ovrs = roundToMean(shifted, starters, average, lo, hi);
  const full = { ...input, average, spread };
  return { ...full, ovrs, players: ovrs.map((ovr, i) => labPlayer(full, i, ovr)) };
}

/**
 * Clamps and rounds each value, then moves the starters one point at a time — those whose rounding
 * moved them furthest first, never past the bounds — so the starters' mean lands on `average`.
 */
function roundToMean(
  values: number[],
  starters: number,
  average: number,
  lo: number,
  hi: number,
): number[] {
  const out = values.map((v) => clamp(Math.round(v), lo, hi));
  let excess = out.slice(0, starters).reduce((a, b) => a + b, 0) - average * starters;
  const order = Array.from({ length: starters }, (_, i) => i).sort(
    (a, b) => out[b]! - values[b]! - (out[a]! - values[a]!),
  );
  if (excess < 0) order.reverse();
  for (let moved = true; excess !== 0 && moved;) {
    moved = false;
    for (const i of order) {
      if (excess === 0) break;
      const next = out[i]! + (excess > 0 ? -1 : 1);
      if (next < lo || next > hi) continue;
      out[i] = next;
      excess += excess > 0 ? -1 : 1;
      moved = true;
    }
  }
  return out;
}

/** The side with one player remade at `ovr`; his id stream, position and role stay. */
export function setLabPlayerOvr(
  side: LabSide,
  sideIndex: LabSideIndex,
  index: number,
  ovr: number,
): LabSide {
  const value = clamp(Math.round(ovr), ...LAB_CONFIG.ovrRange);
  const ovrs = side.ovrs.map((v, i) => (i === index ? value : v));
  const input = {
    side: sideIndex,
    seed: side.seed,
    tactic: side.tactic,
    average: side.average,
    spread: side.spread,
  };
  return {
    ...side,
    ovrs,
    players: side.players.map((p, i) => (i === index ? labPlayer(input, i, value) : p)),
  };
}

/** A side rebuilt from its seed, tactic and OVRs (a kept run or a reloaded page). */
export function labSideFromOvrs(input: LabSideInput, ovrs: readonly number[]): LabSide {
  const fresh = generateLabSide(input);
  const players = fresh.players.map((p, i) =>
    ovrs[i] === undefined || ovrs[i] === fresh.ovrs[i] ? p : labPlayer(input, i, ovrs[i]!),
  );
  return { ...fresh, ovrs: fresh.ovrs.map((v, i) => ovrs[i] ?? v), players };
}

/** The starters' mean OVR as the page shows it. */
export const labStarterAverage = (side: Pick<LabSide, 'tactic' | 'ovrs'>) => {
  const n = FORMATIONS[side.tactic].slots.length;
  return side.ovrs.slice(0, n).reduce((a, b) => a + b, 0) / n;
};
