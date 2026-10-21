/**
 * Adapts a fixture's existing prepared match to the aggregate kernel (→MATCH-2, MATCH-22): the
 * prepared strength, possession chance, tactics and profiles are copied as they are and effective
 * skills stay behind the injected accessor, so neither a second strength formula nor another
 * squad is created. Participation helpers turn the planned stints into time-weighted units.
 */
import type { Tactic } from '../../../contracts/src/types';
import type { Line } from '../../../contracts/src/player';
import { FORMATIONS, isWide, lineOf } from '../player';
import type {
  AggregateAttribute,
  AggregateInput,
  AggregateLength,
  AggregateParticipation,
  AggregatePrepared,
  AggregateSide,
  AggregateSideInput,
  AggregateSkillAccess,
  AggregateSlot,
  AggregateStint,
} from './types';

const slotCache = new Map<Tactic, readonly AggregateSlot[]>();
/** A formation's slots: their line and whether they are flank slots. */
export function aggregateSlots(tactic: Tactic): readonly AggregateSlot[] {
  let slots = slotCache.get(tactic);
  if (!slots) {
    slots = FORMATIONS[tactic].slots.map((slot) => ({
      line: lineOf(slot.position),
      wide: isWide(slot.position),
    }));
    slotCache.set(tactic, slots);
  }
  return slots;
}

/**
 * The kernel's input from a prepared fixture and its skill accessor. `participants` lists each
 * side's candidates (the XI in slot order, then the bench) when the plan uses substitutes; by
 * default they are the prepared XI.
 */
export function buildAggregateInput(
  prepared: AggregatePrepared,
  access: AggregateSkillAccess,
  participants: readonly [readonly { id: string }[], readonly { id: string }[]] = prepared.squads,
): AggregateInput {
  const side = (s: AggregateSide): AggregateSideInput => {
    const profile = prepared.profiles[s]!;
    return {
      lines: participants[s].map((p) => ({ id: p.id })),
      slots: aggregateSlots(prepared.tactics[s]),
      tactic: prepared.tactics[s],
      strength: prepared.strength[s]!,
      profile: {
        possession: profile.possession,
        pass: profile.pass,
        shot: profile.shot,
        defense: profile.defense,
        pressure: profile.pressure,
      },
    };
  };
  return {
    seed: prepared.w.seed,
    fixture: prepared.f.id,
    year: prepared.f.year,
    possessionChance: prepared.possessionChance,
    sides: [side(0), side(1)],
    access,
  };
}

/** The XI in its slots for the whole match, nobody booked: the plan before any incident. */
export function fullParticipation(
  input: AggregateInput,
  length: AggregateLength = 90,
): AggregateParticipation {
  const xi = (s: AggregateSide): AggregateStint[] =>
    input.sides[s].slots.map((_, slot) => ({ line: slot, slot, from: 0, to: length }));
  return { length, stints: [xi(0), xi(1)], incidents: [] };
}

/** Participation that cannot condition a match: stints outside the match, roster or slots. */
export function participationIssues(
  input: AggregateInput,
  participation: AggregateParticipation,
): string[] {
  const out: string[] = [];
  const { length } = participation;
  for (const s of [0, 1] as const) {
    const { lines, slots } = input.sides[s];
    for (const stint of participation.stints[s]) {
      const at = `side ${s} line ${stint.line} slot ${stint.slot}`;
      if (!Number.isInteger(stint.line) || stint.line < 0 || stint.line >= lines.length)
        out.push(`${at}: no such participant`);
      if (!Number.isInteger(stint.slot) || stint.slot < 0 || stint.slot >= slots.length)
        out.push(`${at}: no such slot`);
      if (!(stint.from >= 0 && stint.from < stint.to && stint.to <= length))
        out.push(`${at}: ${stint.from}–${stint.to} outside 0–${length}`);
    }
    // A slot holds one player at a time.
    const bySlot = new Map<number, AggregateStint[]>();
    for (const stint of participation.stints[s])
      bySlot.set(stint.slot, [...(bySlot.get(stint.slot) ?? []), stint]);
    for (const [slot, stints] of bySlot) {
      const sorted = [...stints].sort((a, b) => a.from - b.from);
      for (let i = 1; i < sorted.length; i++)
        if (sorted[i]!.from < sorted[i - 1]!.to) out.push(`side ${s} slot ${slot} doubly held`);
    }
  }
  const ids = input.sides.map((side) => new Set(side.lines.map((l) => l.id)));
  for (const x of participation.incidents)
    if (!ids[x.side]!.has(x.player)) out.push(`${x.kind} names ${x.player} outside side ${x.side}`);
  return out;
}

/** What units the kernel reads for one side over one stretch of the match. */
export interface AggregateUnits {
  /** Players short of eleven on average over the stretch. */
  missing: number;
  passing: number;
  pressing: number;
  dribbling: number;
  attack: number;
  defence: number;
  crossing: number;
  aerial: number;
  shooting: number;
  keeping: number;
}

type Blend = readonly (readonly [AggregateAttribute, number])[];
const UNIT_BLENDS: Record<Exclude<keyof AggregateUnits, 'missing'>, [readonly Line[], Blend]> = {
  passing: [
    ['DF', 'MF'],
    [
      ['passing', 0.7],
      ['vision', 0.3],
    ],
  ],
  pressing: [
    ['DF', 'MF', 'FW'],
    [
      ['tackling', 0.5],
      ['positioning', 0.3],
      ['pace', 0.2],
    ],
  ],
  dribbling: [
    ['MF', 'FW'],
    [
      ['dribbling', 0.7],
      ['pace', 0.3],
    ],
  ],
  attack: [
    ['MF', 'FW'],
    [
      ['finishing', 0.4],
      ['vision', 0.3],
      ['dribbling', 0.15],
      ['pace', 0.15],
    ],
  ],
  defence: [
    ['DF', 'MF'],
    [
      ['tackling', 0.4],
      ['positioning', 0.4],
      ['heading', 0.2],
    ],
  ],
  crossing: [['DF', 'MF', 'FW'], [['crossing', 1]]],
  aerial: [['DF', 'FW'], [['heading', 1]]],
  shooting: [['FW', 'MF'], [['finishing', 1]]],
  keeping: [
    ['GK'],
    [
      ['reflexes', 0.7],
      ['handling', 0.3],
    ],
  ],
};
/** A unit nobody of its lines covers (a side reduced to its keeper) reads at this level. */
const UNCOVERED = 30;

/**
 * A side's units over `[from, to)`: each the time-weighted mean of the on-pitch players of its
 * lines, read at the middle of each stint's overlap, and the players it was short on average.
 * The crossing unit reads flank slots only when the side has any on the pitch.
 */
export function sideUnits(
  input: AggregateInput,
  participation: AggregateParticipation,
  side: AggregateSide,
  from: number,
  to: number,
): AggregateUnits {
  const { slots } = input.sides[side];
  const span = to - from;
  let present = 0;
  const units = { missing: 0 } as AggregateUnits;
  const overlaps = participation.stints[side].flatMap((stint) => {
    const a = Math.max(from, stint.from),
      b = Math.min(to, stint.to);
    return b > a ? [{ stint, weight: b - a, minute: (a + b) / 2 }] : [];
  });
  for (const o of overlaps) present += o.weight;
  units.missing = Math.max(0, 11 - present / span);
  for (const key of Object.keys(UNIT_BLENDS) as (keyof typeof UNIT_BLENDS)[]) {
    const [lines, blend] = UNIT_BLENDS[key];
    const flank = key === 'crossing' && overlaps.some((o) => slots[o.stint.slot]!.wide);
    let total = 0,
      weight = 0;
    for (const o of overlaps) {
      const slot = slots[o.stint.slot]!;
      if (!lines.includes(slot.line) || (flank && !slot.wide)) continue;
      let value = 0;
      for (const [attribute, share] of blend)
        value += share * input.access.skill(side, o.stint.line, attribute, o.minute);
      total += value * o.weight;
      weight += o.weight;
    }
    units[key] = weight > 0 ? total / weight : UNCOVERED;
  }
  return units;
}

/** Cards of a side in a stretch, as TD counts them, and those shown for a foul (→MATCH-19). */
export function sideCards(
  participation: AggregateParticipation,
  side: AggregateSide,
  from: number,
  to: number,
) {
  let yellow = 0,
    red = 0,
    fouls = 0;
  for (const x of participation.incidents) {
    if (x.side !== side || x.minute <= from || x.minute > to) continue;
    if (x.kind !== 'yellow' && x.kind !== 'secondYellow' && x.kind !== 'red') continue;
    if (x.kind !== 'red') yellow++;
    if (x.kind !== 'yellow') red++;
    if (x.reason !== 'dissent') fouls++;
  }
  return { yellow, red, fouls };
}
