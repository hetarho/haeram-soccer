import { describe, expect, it } from 'vitest';
import { TD, TEAM_DETAIL_SIZE } from '../../../contracts/src/detail';
import type { Incident, Tactic } from '../../../contracts/src/types';
import { cellBand } from '../grid/pitch';
import { M } from '../grid/record';
import { finishing, targetChance } from '../match';
import { AGGREGATE_CONFIG } from './config';
import { buildAggregateInput, fullParticipation } from './input';
import { inBoxCell, isPassKind, teamFactsIssues, xtGain } from './ledger';
import { aggregateStreams, generateTeamFacts } from './team';
import type {
  AggregateInput,
  AggregateParticipation,
  AggregateProfile,
  AggregateTeamFacts,
} from './types';

// Synthetic, explicitly marked test data: two XIs with flat effective skills (→ARCH-21).
const neutral: AggregateProfile = { possession: 0, pass: 0, shot: 0, defense: 0, pressure: 0 };
function context(
  o: {
    skills?: [number, number];
    strength?: [number, number];
    possession?: number;
    tactics?: [Tactic, Tactic];
    profiles?: [AggregateProfile, AggregateProfile];
  } = {},
): AggregateInput {
  const skills = o.skills ?? [70, 70];
  const xi = (side: number) =>
    Array.from({ length: 11 }, (_, i) => ({ id: `synthetic-${side}-${i}` }));
  return buildAggregateInput(
    {
      w: { seed: 'synthetic' },
      f: { id: 'synthetic-fixture', year: 2024 },
      squads: [xi(0), xi(1)],
      tactics: o.tactics ?? ['balanced', 'balanced'],
      strength: o.strength ?? skills,
      profiles: o.profiles ?? [neutral, neutral],
      possessionChance: o.possession ?? 0.5,
    },
    { skill: (side) => skills[side], finishing, targetChance },
  );
}
const play = (
  input: AggregateInput,
  fixture: string,
  participation: AggregateParticipation = fullParticipation(input),
) => generateTeamFacts(input, aggregateStreams('synthetic', fixture), participation);
const fixtures = (n: number, prefix = 'fx') =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
const mean = (runs: AggregateTeamFacts[], value: (f: AggregateTeamFacts) => number) =>
  runs.reduce((sum, f) => sum + value(f), 0) / runs.length;

/** Side 0's slot `slot` is sent off at `minute` (a red card for denying a chance). */
function sentOff(input: AggregateInput, minute: number, slot = 9): AggregateParticipation {
  const base = fullParticipation(input);
  const player = input.sides[0].lines[slot]!.id;
  const incidents: Incident[] = [
    {
      minute: 10,
      side: 1,
      kind: 'yellow',
      player: input.sides[1].lines[4]!.id,
      reason: 'reckless',
    },
    { minute, side: 0, kind: 'red', player, reason: 'dogso' },
  ];
  return {
    ...base,
    stints: [
      base.stints[0].map((s) => (s.slot === slot ? { ...s, to: minute - 1 } : s)),
      base.stints[1],
    ],
    incidents,
  };
}

describe('aggregate team facts', () => {
  it('produces every team counter', () => {
    const input = context();
    const runs = fixtures(80).map((id) => play(input, id, sentOff(input, 60)));
    const seen = { metrics: new Set<number>(), detail: new Set<number>() };
    for (const f of runs) {
      expect(teamFactsIssues(f)).toEqual([]);
      for (const side of f.sides) {
        expect(side.metrics).toHaveLength(12);
        expect(side.detail).toHaveLength(TEAM_DETAIL_SIZE);
        expect(side.metrics[M.minutes]).toBe(90);
        side.metrics.forEach((v, i) => v > 0 && seen.metrics.add(i));
        side.detail.forEach((v, i) => v > 0 && seen.detail.add(i));
      }
      expect(f.sides[0].metrics[M.possession]! + f.sides[1].metrics[M.possession]!).toBe(90);
      expect(f.score).toEqual([f.sides[0].metrics[M.goals], f.sides[1].metrics[M.goals]]);
    }
    // Every counter is generated, not left at a placeholder zero.
    expect([...seen.metrics].sort((a, b) => a - b)).toEqual(Object.values(M));
    expect([...seen.detail].sort((a, b) => a - b)).toEqual(Object.values(TD));
  });

  it('derives shot xg and classes from the same chances', () => {
    const input = context();
    for (const id of fixtures(40)) {
      const f = play(input, id);
      for (const side of [0, 1] as const) {
        const { shots, moves } = f.ledger.sides[side];
        const { metrics: m, detail: t, xg } = f.sides[side];
        const keyed = shots.filter((s) => s.source >= 0 && isPassKind(moves[s.source]!.kind));
        expect(xg).toBe(shots.reduce((n, s) => n + s.xg, 0));
        expect(m[M.shots]).toBe(shots.length);
        expect(m[M.goals]).toBe(shots.filter((s) => s.outcome === 'goal').length);
        expect(m[M.onTarget]).toBe(shots.filter((s) => /goal|save/.test(s.outcome)).length);
        expect(t[TD.boxShots]).toBe(shots.filter((s) => inBoxCell(s.cell)).length);
        expect(t[TD.bigChances]).toBe(shots.filter((s) => s.xg >= 30).length);
        expect(t[TD.keyPasses]).toBe(keyed.length);
        expect(m[M.assists]).toBe(keyed.filter((s) => s.outcome === 'goal').length);
        for (const s of shots) {
          if (s.source >= 0) expect(moves[s.source]!.to).toBe(s.cell);
          if (!inBoxCell(s.cell)) expect(s.xg).toBeLessThan(30);
        }
        // The keeper's saves are the opponent's shots on target that did not go in.
        expect(f.ledger.sides[1 - side]!.shots.filter((s) => s.outcome === 'save')).toHaveLength(
          m[M.saves]!,
        );
      }
    }
  });

  it('derives spatial counters from shared flow facts', () => {
    const input = context();
    for (const id of fixtures(30)) {
      const f = play(input, id);
      for (const side of [0, 1] as const) {
        const own = f.ledger.sides[side].moves,
          opp = f.ledger.sides[1 - side]!.moves;
        const t = f.sides[side].detail,
          m = f.sides[side].metrics;
        const passes = own.filter((mv) => isPassKind(mv.kind));
        const total = (list: typeof own, v: (mv: (typeof own)[number]) => number) =>
          list.reduce((n, mv) => n + v(mv), 0);
        const band = (c: number) => cellBand(c);
        expect(t[TD.finalThirdPasses]! + t[TD.buildUpPasses]!).toBe(m[M.passes]);
        expect(t[TD.finalThirdPasses]).toBe(
          total(passes, (mv) => (band(mv.from) >= 5 ? mv.attempts : 0)),
        );
        expect(t[TD.progressivePasses]).toBe(
          total(passes, (mv) => (band(mv.to) > band(mv.from) ? mv.completed : 0)),
        );
        expect(t[TD.boxEntries]).toBe(
          total(own, (mv) => (inBoxCell(mv.to) && !inBoxCell(mv.from) ? mv.completed : 0)),
        );
        expect(t[TD.xtAdded]).toBe(total(own, (mv) => mv.completed * xtGain(mv.from, mv.to)));
        // The ball this side wins is the ball the opponent loses, where it lost it.
        const lost = (upTo: number) =>
          total(opp, (mv) =>
            isPassKind(mv.kind)
              ? band(mv.to) <= upTo
                ? mv.intercepted
                : 0
              : band(mv.from) <= upTo
                ? mv.attempts - mv.completed
                : 0,
          );
        expect(t[TD.highTurnovers]).toBe(lost(2));
        expect(t[TD.pressActions]).toBe(lost(4));
        expect(m[M.tackles]! + m[M.interceptions]!).toBe(lost(7));
        expect(t[TD.throwIns]).toBe(total(opp, (mv) => mv.outTouch));
      }
      // PPDA and field tilt read recorded denominators of both sides.
      const [a, b] = f.sides;
      expect(a.detail[TD.pressActions]).toBeGreaterThan(0);
      expect(b.detail[TD.buildUpPasses]! / a.detail[TD.pressActions]!).toBeGreaterThan(1);
      expect(a.detail[TD.finalThirdPasses]! + b.detail[TD.finalThirdPasses]!).toBeGreaterThan(0);
    }
  });

  it('conserves attempts and completions', () => {
    const input = context({ tactics: ['counter', 'press'] });
    for (const id of fixtures(40)) {
      const f = play(input, id);
      for (const side of [0, 1] as const) {
        const ledger = f.ledger.sides[side];
        for (const mv of ledger.moves) {
          expect(mv.completed).toBeLessThanOrEqual(mv.attempts);
          expect(mv.offside + mv.intercepted + mv.outTouch + mv.outByline).toBeLessThanOrEqual(
            mv.attempts - mv.completed,
          );
        }
        const { metrics: m, detail: t } = f.sides[side];
        expect(m[M.completed]).toBeLessThanOrEqual(m[M.passes]!);
        expect(t[TD.finalThirdCompleted]).toBeLessThanOrEqual(t[TD.finalThirdPasses]!);
        expect(t[TD.crossesCompleted]).toBeLessThanOrEqual(t[TD.crosses]!);
        expect(t[TD.throughBallsCompleted]).toBeLessThanOrEqual(t[TD.throughBalls]!);
        expect(m[M.dribbles]).toBeLessThanOrEqual(t[TD.takeOns]!);
        expect(t[TD.keyPasses]).toBeLessThanOrEqual(m[M.shots]!);
        expect(t[TD.bigChancesScored]).toBeLessThanOrEqual(t[TD.bigChances]!);
        expect(t[TD.bigChances]).toBeLessThanOrEqual(t[TD.boxShots]!);
        expect(t[TD.boxShots]).toBeLessThanOrEqual(m[M.shots]!);
        // Each corner won is delivered once; penalties are the fouls in the box, each taken.
        const corners = ledger.moves.filter((mv) => mv.setPiece === 'corner');
        expect(corners.reduce((n, mv) => n + mv.attempts, 0)).toBe(t[TD.corners]);
        expect(ledger.shots.filter((s) => s.kind === 'penalty')).toHaveLength(t[TD.penalties]!);
        expect(t[TD.penaltiesScored]).toBeLessThanOrEqual(t[TD.penalties]!);
        expect(t[TD.freeKicks]).toBeGreaterThanOrEqual(
          ledger.moves.filter((mv) => mv.setPiece === 'freeKick').length,
        );
      }
    }
  });

  it('responds to tactic and strength inputs', () => {
    const ids = fixtures(150);
    const even = ids.map((id) => play(context(), id));
    const strong = ids.map((id) =>
      play(context({ skills: [82, 62], strength: [82, 62], possession: 0.6 }), id),
    );
    const side0 = (runs: AggregateTeamFacts[], v: (s: AggregateTeamFacts['sides'][0]) => number) =>
      mean(runs, (f) => v(f.sides[0]));
    expect(side0(strong, (s) => s.metrics[M.possession]!)).toBeGreaterThan(
      side0(even, (s) => s.metrics[M.possession]!) + 4,
    );
    for (const v of [
      (s: AggregateTeamFacts['sides'][0]) => s.metrics[M.shots]!,
      (s: AggregateTeamFacts['sides'][0]) => s.xg,
      (s: AggregateTeamFacts['sides'][0]) => s.metrics[M.goals]!,
      (s: AggregateTeamFacts['sides'][0]) => s.metrics[M.completed]! / s.metrics[M.passes]!,
      (s: AggregateTeamFacts['sides'][0]) => s.detail[TD.boxEntries]!,
    ])
      expect(side0(strong, v)).toBeGreaterThan(side0(even, v) * 1.05);
    // Pressing wins the ball high; counter-attacking plays in behind; profile points move passing.
    const press = ids.map((id) => play(context({ tactics: ['press', 'balanced'] }), id));
    expect(side0(press, (s) => s.detail[TD.highTurnovers]!)).toBeGreaterThan(
      side0(even, (s) => s.detail[TD.highTurnovers]!) * 1.2,
    );
    const counter = ids.map((id) => play(context({ tactics: ['counter', 'balanced'] }), id));
    expect(side0(counter, (s) => s.detail[TD.throughBalls]!)).toBeGreaterThan(
      side0(even, (s) => s.detail[TD.throughBalls]!) * 1.3,
    );
    expect(side0(counter, (s) => s.metrics[M.passes]!)).toBeLessThan(
      side0(even, (s) => s.metrics[M.passes]!),
    );
    const sharp = ids.map((id) =>
      play(context({ profiles: [{ ...neutral, pass: 6, shot: 4 }, neutral] }), id),
    );
    expect(side0(sharp, (s) => s.metrics[M.completed]! / s.metrics[M.passes]!)).toBeGreaterThan(
      side0(even, (s) => s.metrics[M.completed]! / s.metrics[M.passes]!) +
        0.05 * AGGREGATE_CONFIG.completion.profile,
    );
    expect(side0(sharp, (s) => s.metrics[M.shots]!)).toBeGreaterThan(
      side0(even, (s) => s.metrics[M.shots]!),
    );
  });

  it('accounts for man-short intervals', () => {
    const input = context();
    const ids = fixtures(150);
    const full = ids.map((id) => play(input, id));
    const short = ids.map((id) => play(input, id, sentOff(input, 20)));
    const side = (runs: AggregateTeamFacts[], s: 0 | 1, v: (f: AggregateTeamFacts) => number[]) =>
      mean(runs, (f) => v(f)[s]!);
    const possession = (f: AggregateTeamFacts) => f.sides.map((x) => x.metrics[M.possession]!);
    const xg = (f: AggregateTeamFacts) => f.sides.map((x) => x.xg);
    expect(side(short, 0, possession)).toBeLessThan(side(full, 0, possession) - 1);
    expect(side(short, 0, xg)).toBeLessThan(side(full, 0, xg) * 0.95);
    expect(side(short, 1, xg)).toBeGreaterThan(side(full, 1, xg) * 1.05);
    for (const f of short) {
      expect(f.sides[0].detail[TD.redCards]).toBe(1);
      expect(f.sides[1].detail[TD.yellowCards]).toBe(1);
      // Each card shown for a foul is one of the side's fouls.
      expect(f.sides[0].detail[TD.fouls]).toBeGreaterThanOrEqual(1);
      expect(f.sides[1].detail[TD.fouls]).toBeGreaterThanOrEqual(1);
    }
  });

  it('extends period facts for extra time', () => {
    const input = context();
    for (const id of fixtures(20)) {
      const regulation = play(input, id);
      const extended = play(input, id, fullParticipation(input, 120));
      expect(extended.length).toBe(120);
      expect(extended.ledger.periods).toEqual(['regulation', 'extra']);
      expect(extended.sides[0].metrics[M.minutes]).toBe(120);
      expect(extended.regulation).toEqual(regulation.score);
      expect(teamFactsIssues(extended)).toEqual([]);
      for (const side of [0, 1] as const) {
        const first = extended.ledger.sides[side];
        expect(first.moves.filter((mv) => mv.period === 'regulation')).toEqual(
          regulation.ledger.sides[side].moves,
        );
        expect(first.shots.filter((s) => s.period === 'regulation')).toEqual(
          regulation.ledger.sides[side].shots,
        );
        for (const s of first.shots.filter((x) => x.period === 'extra'))
          expect(s.minute).toBeGreaterThan(90);
      }
      expect(extended.sides[0].metrics[M.passes]).toBeGreaterThan(
        regulation.sides[0].metrics[M.passes]!,
      );
    }
  });

  it('is deterministic for its named streams', () => {
    const input = context();
    const streams = aggregateStreams('synthetic', 'fx-1');
    expect(streams.names('flow', 'regulation')).toBe(
      'synthetic:continuous-aggregate-1:aggregate:flow:regulation:fx-1',
    );
    // A named stream restarts its sequence however often it is asked for.
    const a = streams.draw('shots', 'regulation'),
      b = streams.draw('shots', 'regulation');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const once = play(input, 'fx-1');
    expect(play(input, 'fx-1')).toEqual(once);
    expect(play(input, 'fx-2')).not.toEqual(once);
    expect(
      generateTeamFacts(
        input,
        aggregateStreams('synthetic', 'fx-1', 'another-revision'),
        fullParticipation(input),
      ),
    ).not.toEqual(once);
  });

  it('refuses participation outside the match or its roster', () => {
    const input = context();
    const base = fullParticipation(input);
    const late: AggregateParticipation = {
      ...base,
      stints: [base.stints[0].map((s) => ({ ...s, to: 95 })), base.stints[1]],
    };
    expect(() => play(input, 'fx', late)).toThrow(/outside 0–90/);
    const stranger: AggregateParticipation = {
      ...base,
      incidents: [{ minute: 5, side: 0, kind: 'yellow', player: 'nobody' }],
    };
    expect(() => play(input, 'fx', stranger)).toThrow(/outside side 0/);
  });

  it('keeps a per-shot xG and the band config in record units', () => {
    const input = context();
    for (const id of fixtures(20))
      for (const side of play(input, id).ledger.sides)
        for (const s of side.shots) {
          expect(Number.isInteger(s.xg)).toBe(true);
          expect(s.xg).toBeGreaterThanOrEqual(AGGREGATE_CONFIG.xg.min);
          expect(s.xg).toBeLessThanOrEqual(AGGREGATE_CONFIG.xg.max);
        }
  });
});
