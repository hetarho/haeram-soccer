import { describe, expect, it } from 'vitest';
import { PD, TD } from '../../../contracts/src/detail';
import { isScriptedModel } from '../../../contracts/src/match-model';
import type { Line } from '../../../contracts/src/player';
import { DEFAULT_SUB_POLICY, eraRules } from '../match/rules';
import { M } from '../match/record';
import { FORMATIONS } from '../player';
import { finishing, targetChance } from '../match';
import { buildAggregateInput } from './input';
import { isPassKind } from './ledger';
import { onPitchAt, planParticipation, playedMinutes } from './participation';
import { attributePlayerFacts } from './players';
import { aggregateStreams, generateTeamFacts } from './team';
import type {
  AggregateAttributionTrace,
  AggregatePlan,
  AggregateProfile,
  AggregateSide,
  AggregateSkillAccess,
} from './types';

// Synthetic, explicitly marked test data: skills that differ by line, a full bench (→ARCH-21).
const neutral: AggregateProfile = { possession: 0, pass: 0, shot: 0, defense: 0, pressure: 0 };
const BENCH_LINES: Line[] = ['GK', 'DF', 'MF', 'FW', 'DF', 'MF', 'FW', 'MF', 'FW'];

function match(
  fixture: string,
  year = 2024,
  length: 90 | 120 = 90,
  own?: AggregateSkillAccess['own'],
) {
  const era = eraRules(year);
  const roster = (side: number) =>
    Array.from({ length: 11 + era.named }, (_, i) => ({ id: `synthetic-${side}-${i}` }));
  const input = buildAggregateInput(
    {
      w: { seed: 'synthetic' },
      f: { id: fixture, year },
      squads: [roster(0).slice(0, 11), roster(1).slice(0, 11)],
      tactics: ['counter', 'possession'],
      strength: [72, 68],
      profiles: [neutral, neutral],
      possessionChance: 0.52,
    },
    { skill: (side, line) => 60 + ((line * 7 + side * 3) % 25), own, finishing, targetChance },
    [roster(0), roster(1)],
  );
  const tactics = ['counter', 'possession'] as const;
  const side = (s: AggregateSide) => ({
    shape: { tactic: tactics[s], roles: FORMATIONS[tactics[s]].slots.map((slot) => slot.role) },
    candidates: input.sides[s].lines.map((l, i) => ({
      id: l.id,
      line: i < 11 ? input.sides[s].slots[i]!.line : BENCH_LINES[i - 11]!,
      born: year - 24,
      fatigue: 25,
      stamina: 55 + (i % 4) * 8,
      injury: 0.05,
      reflexes: i === 0 ? 75 : 12,
      slotLevel: input.sides[s].slots.map(() => 60 + (i % 7)),
      traits: [],
    })),
    policy: { ...DEFAULT_SUB_POLICY },
    pressing: false,
    drain: 1,
    actionWeight: () => 1,
  });
  const plan: AggregatePlan = { era, placed: false, sides: [side(0), side(1)] };
  const streams = aggregateStreams('synthetic', fixture);
  const participation = planParticipation(input, plan, streams, length);
  const facts = generateTeamFacts(input, streams, participation);
  const players = attributePlayerFacts(input, plan, participation, facts, streams);
  return { input, plan, participation, facts, players, streams };
}
const fixtures = (n: number, prefix = 'fx') =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
const SHARED = (Object.keys(PD) as (keyof typeof PD)[]).filter(
  (key): key is keyof typeof PD & keyof typeof TD => key in TD,
);

describe('aggregate player attribution (→MATCH-11, MATCH-13, MATCH-27)', () => {
  it('reconciles full player and team totals', () => {
    for (const fixture of fixtures(40, 'sum')) {
      const { facts, players } = match(fixture, 2008, fixture.endsWith('7') ? 120 : 90);
      for (const side of [0, 1] as const) {
        const lines = players.sides[side],
          team = facts.sides[side];
        const sum = (row: 'metrics' | 'detail', index: number) =>
          lines.reduce((n, l) => n + l[row][index]!, 0);
        for (let index = 0; index < M.minutes; index++)
          expect(sum('metrics', index), `metric ${index}`).toBe(team.metrics[index]);
        for (const key of SHARED) expect(sum('detail', PD[key]), key).toBe(team.detail[TD[key]]);
        expect(sum('detail', PD.foulsWon)).toBe(facts.sides[side === 0 ? 1 : 0].detail[TD.fouls]);
        expect(sum('detail', PD.xg)).toBe(team.xg);
        for (const l of lines) {
          expect(l.metrics[M.completed]).toBeLessThanOrEqual(l.metrics[M.passes]!);
          expect(l.metrics[M.goals]).toBeLessThanOrEqual(l.metrics[M.onTarget]!);
          expect(l.metrics[M.assists]).toBeLessThanOrEqual(l.detail[PD.keyPasses]!);
          expect(l.metrics[M.dribbles]).toBeLessThanOrEqual(l.detail[PD.takeOns]!);
          expect(l.detail[PD.bigChancesCreated]).toBeLessThanOrEqual(l.detail[PD.keyPasses]!);
          expect(l.detail[PD.lineBreakingPasses]).toBeLessThanOrEqual(l.metrics[M.completed]!);
        }
      }
    }
  });

  it('offsides fall on receivers with low 판단력 more than on those with high', () => {
    // Synthetic: lines alternate between 판단력 50 and 85 on otherwise equal skills, so the
    // offside role's own-판단력 weight (T384) alone separates them.
    const own: AggregateSkillAccess['own'] = (_side, line) => (line % 2 ? 85 : 50);
    let low = 0,
      high = 0;
    for (const fixture of fixtures(40, 'offside'))
      for (const lines of match(fixture, 2024, 90, own).players.sides)
        lines.forEach((l, line) => {
          if (line % 2) high += l.detail[PD.offsides]!;
          else low += l.detail[PD.offsides]!;
        });
    expect(low + high).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(3 * high);
  });

  it('never credits an unavailable or off-pitch player', () => {
    for (const fixture of fixtures(40, 'pitch')) {
      const { input, participation, facts, players } = match(fixture, 2024);
      for (const credit of players.shots) {
        expect(onPitchAt(participation, credit.side, credit.shooter, credit.minute)).toBe(true);
        if (credit.passer !== undefined) {
          expect(credit.passer).not.toBe(credit.shooter);
          expect(onPitchAt(participation, credit.side, credit.passer, credit.minute)).toBe(true);
        }
      }
      for (const side of [0, 1] as const) {
        const minutes = playedMinutes(participation, side);
        const listed = new Set(players.sides[side].map((l) => l.line));
        // Exactly those who played have lines: an unused substitute has none.
        expect([...listed].sort((a, b) => a - b)).toEqual(
          [...minutes.keys()].sort((a, b) => a - b),
        );
        for (const l of players.sides[side]) expect(l.metrics[M.minutes]).toBe(minutes.get(l.line));
        // The keeper in goal makes the saves: a save is credited to whoever held slot 0 then.
        const saves = players.sides[side].reduce((n, l) => n + l.metrics[M.saves]!, 0);
        expect(saves).toBe(facts.sides[side].metrics[M.saves]);
      }
      expect(input.sides[0].lines.length).toBe(20);
    }
  });

  it('shares shots, key passes, xG and xA between the same chances', () => {
    for (const fixture of fixtures(30, 'chances')) {
      const { facts, players } = match(fixture);
      for (const side of [0, 1] as const) {
        const shots = facts.ledger.sides[side].shots;
        const keyed = players.shots.filter((c) => c.side === side && c.passer !== undefined);
        // Every shot after a completed pass names its key passer, and only those do.
        expect(keyed.length).toBe(facts.sides[side].detail[TD.keyPasses]);
        for (const c of players.shots.filter((x) => x.side === side)) {
          const shot = shots[c.shot]!;
          const passed =
            shot.source >= 0 && isPassKind(facts.ledger.sides[side].moves[shot.source]!.kind);
          expect(c.passer !== undefined).toBe(passed);
        }
        const xa = keyed.reduce((n, c) => n + shots[c.shot]!.xg, 0);
        expect(players.sides[side].reduce((n, l) => n + l.detail[PD.xa]!, 0)).toBe(xa);
        const goals = players.sides[side].reduce((n, l) => n + l.metrics[M.goals]!, 0);
        expect(goals).toBe(facts.score[side]);
      }
    }
  });

  it('returns identical facts on repeated calls', () => {
    const a = match('repeat').players;
    match('another');
    expect(match('repeat').players).toEqual(a);
  });

  const traced = (fixture: string, length: 90 | 120 = 90) => {
    const m = match(fixture, 2008, length);
    const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
    const players = attributePlayerFacts(
      m.input,
      m.plan,
      m.participation,
      m.facts,
      aggregateStreams('synthetic', fixture),
      trace,
    );
    return { ...m, traced: players, trace };
  };
  const total = (xs: readonly number[]) => xs.reduce((n, x) => n + x, 0);

  it('revision 10 attribution is untouched by the place rule', () => {
    for (const fixture of fixtures(6, 'revision-10-place')) {
      const m = traced(fixture);
      const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
      const players = attributePlayerFacts(
        m.input,
        { ...m.plan, placed: isScriptedModel('continuous-aggregate-10') },
        m.participation,
        m.facts,
        aggregateStreams('synthetic', fixture),
        trace,
      );
      expect(players).toEqual(m.players);
      expect(trace).toEqual(m.trace);
    }
  });

  it('a trace changes no fact', () => {
    for (const fixture of fixtures(8, 'trace-same')) {
      const { players, traced: withTrace } = traced(fixture, fixture.endsWith('3') ? 120 : 90);
      expect(withTrace).toEqual(players);
    }
  });

  it('a trace adds up to the ledger and the lines', () => {
    for (const fixture of fixtures(12, 'trace-sum')) {
      const { facts, players, trace } = traced(fixture, fixture.endsWith('5') ? 120 : 90);
      for (const side of [0, 1] as const) {
        const ledger = facts.ledger.sides[side];
        expect(trace.moves[side].length).toBe(ledger.moves.length);
        expect(trace.fouls[side].length).toBe(ledger.fouled.length);
        const passes = new Map<number, number>(),
          takeOns = new Map<number, number>();
        ledger.moves.forEach((move, i) => {
          const t = trace.moves[side][i]!;
          expect(total(t.attempts), `attempts ${i}`).toBe(move.attempts);
          expect(total(t.completed), `completed ${i}`).toBe(move.completed);
          expect(total(t.broke), `broke ${i}`).toBe(move.lineBreaking);
          expect(total(t.offside), `offside ${i}`).toBe(move.offside);
          const pass = isPassKind(move.kind);
          expect(total(t.won), `won ${i}`).toBe(
            pass ? move.intercepted : move.attempts - move.completed,
          );
          t.attempts.forEach((k, line) => {
            expect(t.completed[line]!).toBeLessThanOrEqual(k);
            const into = pass ? passes : move.kind === 'takeOn' ? takeOns : undefined;
            into?.set(line, (into.get(line) ?? 0) + k);
          });
        });
        for (const l of players.sides[side]) {
          expect(passes.get(l.line) ?? 0, `passes ${l.line}`).toBe(l.metrics[M.passes]);
          expect(takeOns.get(l.line) ?? 0, `take-ons ${l.line}`).toBe(l.detail[PD.takeOns]);
        }
        ledger.fouled.forEach((row, i) => {
          const t = trace.fouls[side][i]!;
          expect(t.booked.length + total(t.fouled), `fouled ${i}`).toBe(row.n);
          expect(t.booked.length + total(t.fouler), `fouler ${i}`).toBe(row.n);
        });
      }
    }
  });
});
