import { describe, expect, it } from 'vitest';
import { TD } from '../../../contracts/src/detail';
import type { Incident } from '../../../contracts/src/types';
import type { Line } from '../../../contracts/src/player';
import { DEFAULT_SUB_POLICY, eraRules } from '../grid/setup';
import { finishing, targetChance } from '../match';
import { buildAggregateInput, sideUnits } from './input';
import {
  multinomialDraw,
  onPitchAt,
  participationTimelineIssues,
  planParticipation,
  scoreBefore,
  withheldRebalances,
} from './participation';
import { settleParticipation } from './engine';
import { aggregateStreams, generateTeamFacts } from './team';
import type {
  AggregateInput,
  AggregateParticipation,
  AggregatePlan,
  AggregateProfile,
  AggregateSide,
  AggregateStint,
} from './types';

// Synthetic, explicitly marked test data: flat skills and matchday candidates (→ARCH-21).
const neutral: AggregateProfile = { possession: 0, pass: 0, shot: 0, defense: 0, pressure: 0 };
const BENCH_LINES: Line[] = ['GK', 'DF', 'MF', 'FW', 'DF', 'MF', 'FW', 'MF', 'FW'];

function syntheticMatch(
  year: number,
  injury = 0.018,
): { input: AggregateInput; plan: AggregatePlan } {
  const era = eraRules(year);
  const roster = (side: number) =>
    Array.from({ length: 11 + era.named }, (_, i) => ({ id: `synthetic-${side}-${i}` }));
  const input = buildAggregateInput(
    {
      w: { seed: 'synthetic' },
      f: { id: 'synthetic-fixture', year },
      squads: [roster(0).slice(0, 11), roster(1).slice(0, 11)],
      tactics: ['balanced', 'press'],
      strength: [70, 70],
      profiles: [neutral, neutral],
      possessionChance: 0.5,
    },
    { skill: () => 70, finishing, targetChance },
    [roster(0), roster(1)],
  );
  const side = (s: AggregateSide) => ({
    candidates: input.sides[s].lines.map((l, i) => ({
      id: l.id,
      line: i < 11 ? input.sides[s].slots[i]!.line : BENCH_LINES[i - 11]!,
      born: year - 20 - (i % 12),
      fatigue: 20,
      stamina: 60 + (i % 5) * 5,
      injury,
      reflexes: i === 0 ? 75 : 10 + i,
      slotLevel: input.sides[s].slots.map((slot) =>
        i < 11 || slot.line === BENCH_LINES[i - 11] ? 70 : 55,
      ),
      traits: [],
    })),
    policy: { ...DEFAULT_SUB_POLICY },
    pressing: s === 1,
    drain: 1,
    actionWeight: () => 1,
  });
  return { input, plan: { era, sides: [side(0), side(1)] } };
}
const planned = (year: number, fixture: string, length: 90 | 120 = 90, injury?: number) => {
  const { input, plan } = syntheticMatch(year, injury);
  const streams = aggregateStreams('synthetic', fixture);
  return { input, plan, streams, participation: planParticipation(input, plan, streams, length) };
};
/** A timeline a test may corrupt in place. */
type Editable = { length: 90; stints: [AggregateStint[], AggregateStint[]]; incidents: Incident[] };
const fixtures = (n: number, prefix = 'fx') =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
const onPitch = (p: AggregateParticipation, side: AggregateSide, minute: number) =>
  new Set(p.stints[side].filter((s) => s.from < minute && s.to >= minute).map((s) => s.line)).size;

describe('aggregate participation plan (→MATCH-19, MATCH-20, MATCH-21, MATCH-27)', () => {
  it('limits era substitution windows', () => {
    for (const year of [1950, 1965, 1987, 2008, 2024]) {
      const era = eraRules(year);
      let used = 0,
        full = 0,
        shortHanded = 0;
      for (const fixture of fixtures(150, `era-${year}`)) {
        const { input, participation } = planned(year, fixture, 90, 0.05);
        expect(participationTimelineIssues(input, participation, era)).toEqual([]);
        for (const side of [0, 1] as const) {
          const own = participation.incidents.filter((x) => x.side === side);
          const subs = own.filter((x) => x.kind === 'sub');
          used += subs.length;
          expect(subs.length).toBeLessThanOrEqual(era.maxSubs);
          const windows = new Set(subs.map((x) => x.minute).filter((m) => m !== 46));
          if (era.windows !== undefined) expect(windows.size).toBeLessThanOrEqual(era.windows);
          if (subs.length === era.maxSubs && era.maxSubs > 0) full++;
          if (era.injuryOnly)
            for (const x of subs)
              expect(own.some((y) => y.kind === 'injury' && y.player === x.player)).toBe(true);
          if (onPitch(participation, side, 90) < 11) shortHanded++;
        }
      }
      if (era.maxSubs === 0) {
        expect(used).toBe(0);
        // Without substitutes an injury leaves the side a man short.
        expect(shortHanded).toBeGreaterThan(0);
      } else expect(used).toBeGreaterThan(0);
      if (!era.injuryOnly && era.maxSubs > 0) expect(full).toBeGreaterThan(0);
    }
  });

  it('couples a red card and man-short time', () => {
    let checked = 0;
    for (const fixture of fixtures(400, 'red')) {
      const { input, streams, participation } = planned(1950, fixture);
      const red = participation.incidents.find(
        (x) => x.kind === 'red' || x.kind === 'secondYellow',
      );
      if (!red || participation.incidents.some((x) => x.kind === 'injury')) continue;
      const side = red.side;
      const line = input.sides[side].lines.findIndex((l) => l.id === red.player);
      // He leaves at the stamp and never returns; his side plays a man short from then on.
      const stints = participation.stints[side].filter((s) => s.line === line);
      expect(stints.at(-1)!.to).toBe(red.minute - 1);
      expect(onPitchAt(participation, side, line, red.minute)).toBe(false);
      const sentOff = participation.incidents.filter(
        (x) => x.side === side && (x.kind === 'red' || x.kind === 'secondYellow'),
      );
      const reds = sentOff.length;
      expect(onPitch(participation, side, 90)).toBe(11 - reds);
      // The kernel reads the same timeline: the side is short for the rest of the match.
      const units = sideUnits(input, participation, side, 0, 90);
      const short = sentOff.reduce((n, x) => n + (90 - (x.minute - 1)) / 90, 0);
      expect(units.missing).toBeCloseTo(short, 6);
      expect(units.missing).toBeGreaterThan(0);
      const facts = generateTeamFacts(input, streams, participation);
      expect(facts.sides[side].detail[TD.redCards]).toBe(reds);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('answers a red card by rebalancing without restoring eleven', () => {
    let rebalanced = 0;
    for (const fixture of fixtures(400, 'rebalance')) {
      const { participation } = planned(2008, fixture, 90, 0);
      for (const side of [0, 1] as const) {
        const reds = participation.incidents.filter(
          (x) => x.side === side && (x.kind === 'red' || x.kind === 'secondYellow'),
        );
        if (reds.length === 0) continue;
        expect(onPitch(participation, side, 90)).toBe(11 - reds.length);
        if (
          participation.incidents.some(
            (x) => x.side === side && x.kind === 'sub' && x.minute > reds[0]!.minute,
          )
        )
          rebalanced++;
      }
    }
    expect(rebalanced).toBeGreaterThan(0);
  });

  it('makes no red-card rebalance while trailing', () => {
    let withheldMatches = 0,
      kept = 0;
    for (const fixture of fixtures(400, 'trailing')) {
      const { input, plan } = syntheticMatch(2008, 0);
      const withheld = new Set<string>();
      const { participation, facts } = settleParticipation(
        input,
        plan,
        aggregateStreams('synthetic', fixture),
        90,
        withheld,
        () => input.access,
      );
      expect(participationTimelineIssues(input, participation, plan.era)).toEqual([]);
      // Every rebalance left in the settled match was made level or ahead (→STAFF-45).
      for (const x of participation.rebalances ?? []) {
        expect(scoreBefore(facts, x.side, x.minute)).toBeGreaterThanOrEqual(0);
        kept++;
      }
      expect(withheldRebalances(participation, facts)).toEqual([]);
      if (withheld.size === 0) continue;
      withheldMatches++;
      // The first plan rebalanced a trailing ten-man side (a replay can turn up another); the
      // settled one does not, and the red card still leaves the side a man short.
      const first = planParticipation(input, plan, aggregateStreams('synthetic', fixture), 90);
      expect(first.rebalances!.some((x) => withheld.has(x.key))).toBe(true);
      for (const key of withheld) {
        expect(participation.rebalances!.some((x) => x.key === key)).toBe(false);
        const side = Number(key.split(':')[0]) as AggregateSide;
        const reds = participation.incidents.filter(
          (x) => x.side === side && (x.kind === 'red' || x.kind === 'secondYellow'),
        );
        expect(onPitch(participation, side, 90)).toBe(11 - reds.length);
      }
    }
    expect(withheldMatches).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  it('records an injury and replacement once', () => {
    let checked = 0;
    for (const fixture of fixtures(60, 'hurt')) {
      const { input, participation } = planned(2008, fixture, 90, 0.2);
      for (const x of participation.incidents.filter((y) => y.kind === 'injury')) {
        const side = x.side;
        const lines = input.sides[side].lines;
        const line = lines.findIndex((l) => l.id === x.player);
        const mentions = participation.incidents.filter(
          (y) => y.side === side && (y.player === x.player || y.other === x.player),
        );
        const replaced = mentions.filter((y) => y.kind === 'sub' && y.player === x.player);
        // One injury; at most one replacement, at the same stoppage, into his slot.
        expect(mentions.filter((y) => y.kind === 'injury')).toHaveLength(1);
        expect(replaced.length).toBeLessThanOrEqual(1);
        const last = participation.stints[side].filter((s) => s.line === line).at(-1)!;
        expect(last.to).toBe(x.minute - 1);
        if (replaced.length) {
          const sub = replaced[0]!;
          expect(sub.minute).toBe(x.minute);
          const incoming = lines.findIndex((l) => l.id === sub.other);
          const first = participation.stints[side].filter((s) => s.line === incoming)[0]!;
          expect(first.from).toBe(x.minute - 1);
          if (last.slot !== 0) expect(first.slot).toBe(last.slot);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('extends to extra time without replanning the first 90 minutes', () => {
    for (const fixture of fixtures(40, 'extra')) {
      const regular = planned(2024, fixture, 90).participation;
      const extended = planned(2024, fixture, 120).participation;
      expect(extended.incidents.filter((x) => x.minute <= 90)).toEqual(regular.incidents);
      for (const side of [0, 1] as const) {
        const cut = (p: AggregateParticipation) =>
          p.stints[side].filter((s) => s.from < 90).map((s) => ({ ...s, to: Math.min(90, s.to) }));
        expect(cut(extended)).toEqual(cut(regular));
      }
    }
  });

  it('returns identical facts on repeated calls', () => {
    const a = planned(2024, 'repeat');
    planned(2024, 'another');
    expect(planned(2024, 'repeat').participation).toEqual(a.participation);
  });

  it('rejects illegal timelines', () => {
    const { input, plan, participation } = planned(2024, 'base');
    const era = plan.era;
    const id = (side: AggregateSide, line: number) => input.sides[side].lines[line]!.id;
    expect(participationTimelineIssues(input, participation, era)).toEqual([]);
    const xi = (side: AggregateSide) =>
      input.sides[side].slots.map((_, slot) => ({ line: slot, slot, from: 0, to: 90 }));
    const base = (): Editable => ({ length: 90, stints: [xi(0), xi(1)], incidents: [] });
    const sub = (side: AggregateSide, minute: number, out: number, inn: number): Incident => ({
      minute,
      side,
      kind: 'sub',
      player: id(side, out),
      other: id(side, inn),
    });
    const replace = (p: Editable, minute: number, out: number, inn: number) => {
      p.stints[0] = p.stints[0].flatMap((s) =>
        s.line === out
          ? [
              { ...s, to: minute - 1 },
              { line: inn, slot: s.slot, from: minute - 1, to: 90 },
            ]
          : [s],
      );
      p.incidents.push(sub(0, minute, out, inn));
    };
    expect(participationTimelineIssues(input, base(), era)).toEqual([]);
    const cases: [string, (p: Editable) => void][] = [
      [
        'a card outside match time',
        (p) => p.incidents.push({ minute: 95, side: 0, kind: 'yellow', player: id(0, 3) }),
      ],
      [
        'a card after a dismissal',
        (p) => {
          p.stints[0] = p.stints[0].map((s) => (s.line === 3 ? { ...s, to: 29 } : s));
          p.incidents.push(
            { minute: 30, side: 0, kind: 'red', player: id(0, 3), reason: 'violent' },
            { minute: 50, side: 0, kind: 'yellow', player: id(0, 3) },
          );
        },
      ],
      [
        'playing on after a dismissal',
        (p) =>
          p.incidents.push({ minute: 30, side: 0, kind: 'red', player: id(0, 3), reason: 'dogso' }),
      ],
      [
        'one player in two slots at once',
        (p) => p.stints[0].push({ line: 3, slot: 4, from: 20, to: 40 }),
      ],
      [
        'a substitute who returns',
        (p) => {
          replace(p, 60, 9, 11);
          p.stints[0].push({ line: 9, slot: 9, from: 80, to: 90 });
          p.stints[0] = p.stints[0].map((s) => (s.line === 11 ? { ...s, to: 79 } : s));
        },
      ],
      [
        'a substitute without a substitution',
        (p) => p.stints[0].push({ line: 12, slot: 5, from: 60, to: 90 }),
      ],
      [
        'more windows than the era allows',
        (p) => {
          replace(p, 55, 9, 11);
          replace(p, 60, 8, 12);
          replace(p, 65, 7, 13);
          replace(p, 70, 6, 14);
        },
      ],
      [
        'more substitutions than the era allows',
        (p) => {
          for (let i = 0; i < 6; i++) replace(p, 60, 10 - i, 11 + i);
        },
      ],
      [
        'a second yellow without a first',
        (p) => {
          p.stints[0] = p.stints[0].map((s) => (s.line === 3 ? { ...s, to: 29 } : s));
          p.incidents.push({ minute: 30, side: 0, kind: 'secondYellow', player: id(0, 3) });
        },
      ],
      [
        'a side below seven',
        (p) => {
          for (let line = 1; line <= 5; line++) {
            p.stints[0] = p.stints[0].map((s) =>
              s.line === line ? { ...s, to: 20 + line - 1 } : s,
            );
            p.incidents.push({
              minute: 20 + line,
              side: 0,
              kind: 'red',
              player: id(0, line),
              reason: 'violent',
            });
          }
        },
      ],
    ];
    for (const [name, corrupt] of cases) {
      const p = base();
      corrupt(p);
      expect(participationTimelineIssues(input, p, era), name).not.toEqual([]);
    }
    // The injury-only era: a change needs an injury.
    const early = planned(1965, 'early');
    const p = base();
    p.stints[0] = p.stints[0].flatMap((s) =>
      s.line === 9
        ? [
            { ...s, to: 59 },
            { line: 11, slot: 9, from: 59, to: 90 },
          ]
        : [s],
    );
    p.incidents.push(sub(0, 60, 9, 11));
    expect(participationTimelineIssues(early.input, p, early.plan.era).join()).toMatch(
      /without an injury/,
    );
  });

  it('splits counts exactly over positive weights', () => {
    const r = () => 0.37;
    expect(multinomialDraw(r, 10, [0, 1, 0, 3]).reduce((a, b) => a + b, 0)).toBe(10);
    expect(multinomialDraw(r, 10, [0, 1, 0, 3])[0]).toBe(0);
  });
});
