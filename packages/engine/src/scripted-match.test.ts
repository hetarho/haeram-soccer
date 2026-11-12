/** Host integration gate: real own fixtures and season settlement, never task-tier execution. */
import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { Fixture, MatchPlayback, World } from '../../contracts/src/types';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { careerWorld } from './career.testkit';
import { aggregateRecord, matchdayRosters, playAggregate } from './aggregate/engine';
import type { AggregateAttributionTrace } from './aggregate/types';
import { eraRules } from './match/rules';
import { M } from './match/record';
import { SEASON_ROUNDS } from './calendar';
import { simulateMatch, prepareMatch } from './match';
import { validateFullMatchRecord } from './match-model';
import { MATCH_MODEL_RELEASE } from './match-model-release';
import { advanceRound, closeSeason } from './season';
import { advanceToNextMatch, handTo, holdRows } from './testing';
import { matchDetail } from './script/detail';
import { validateScript } from './script/validate';
import { compareRecord, countScript } from './script/count';

const input = { seed: 'settlement-833', country: 'BEL' as const, year: 2024 };
const world = () =>
  cachedWorld('own-settlement-833', () => careerWorld(input, MATCH_MODEL_RELEASE), {
    input: { ...input, release: MATCH_MODEL_RELEASE },
  });
const ownFixtures = (w: World) =>
  w.fixtures.filter((f) => f.home === w.playerClub || f.away === w.playerClub);
function detailFor(w: World, f: Fixture) {
  const prepared = prepareMatch(w, f);
  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const match = playAggregate(
    w,
    f,
    prepared,
    rosters,
    f.kind === 'cup' ? { awayGoals: false } : undefined,
    undefined,
    trace,
  );
  return {
    detail: matchDetail(match, rosters, trace),
    record: aggregateRecord(f, rosters, match, MATCH_MODEL_RELEASE.revision),
  };
}
function fullPlayback(p: MatchPlayback) {
  expect(p.problems, p.record.id).toBeUndefined();
  expect(validateFullMatchRecord(p.record), p.record.id).toEqual([]);
  expect(p.record.model).toBe(MATCH_MODEL_RELEASE.revision);
  expect(p.record.material, p.record.id).toBeDefined();
  expect(p.frames).toEqual([]);
}

describe('revision 11 own matches on the result path', () => {
  it('the first 22 own fixtures all have valid scripts, material and exact counts', () => {
    const w = world(),
      fixtures = ownFixtures(w).slice(0, 22);
    expect(fixtures).toHaveLength(22);
    // Deliberately the whole prefix, including the 18 failures in the preliminary T833 probe.
    for (const f of fixtures) {
      const p = simulateMatch(w, f, true),
        { detail, record } = detailFor(w, f);
      fullPlayback(p);
      expect(p.script).toBeDefined();
      expect(validateScript(detail, p.script!), f.id).toEqual([]);
      expect(compareRecord(detail, countScript(p.script!, detail), record), f.id).toEqual([]);
      expect(p.record).toEqual({ ...record, material: p.record.material });
    }
    // T825/T827's unchanged sixty-fixture corpus remains in script/build.test.ts and sample.test.ts.
  });
  it('an own match carries its material, xG, detail and incidents, and hands over staging only when watched', () => {
    const w = world(),
      f = ownFixtures(w)[0]!;
    const watched = simulateMatch(w, f, true),
      skipped = simulateMatch(w, f, false);
    fullPlayback(watched);
    fullPlayback(skipped);
    expect(watched.record.xg).toHaveLength(2);
    expect(watched.record.detail).toHaveLength(2);
    expect(watched.record.incidents).toBeDefined();
    expect(watched.staging).toHaveLength(2);
    expect(watched.staging!.map((s) => s.players.length)).toEqual(watched.record.lineCounts);
    expect(skipped.record).toEqual(watched.record);
    expect(skipped.script).toBeUndefined();
    expect(skipped.staging).toBeUndefined();
  });
  it('watching and skipping leave the same world over four rounds', () => {
    const watched = world(),
      skipped = structuredClone(watched);
    while (watched.round < 4) {
      const a = advanceToNextMatch(watched, undefined, true);
      const b = advanceToNextMatch(skipped, undefined, false);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      fullPlayback(a!);
      fullPlayback(b!);
      expect(a!.record).toEqual(b!.record);
      expect(a!.script).toBeDefined();
      expect(b!.script).toBeUndefined();
      expect(canonical(watched)).toBe(canonical(skipped));
    }
  });
  it('an own cup tie level after ninety minutes plays extra time and a shoot-out on the same path', () => {
    const w = world(),
      base = ownFixtures(w)[0]!;
    let found: MatchPlayback | undefined;
    for (let i = 0; i < 200; i++) {
      const f: Fixture = { ...base, id: `own-cup-833:${i}`, kind: 'cup' };
      const p = simulateMatch(w, f, true, true, { awayGoals: false });
      if (!p.record.shootout) continue;
      fullPlayback(p);
      const { detail } = detailFor(w, f);
      expect(p.record.regulation!.home).toBe(p.record.regulation!.away);
      expect(p.record.score.home).toBe(p.record.score.away);
      expect(p.record.metrics[0][M.minutes]).toBe(120);
      expect(p.script!.beats.some((b) => b.kind === 'shootoutKick')).toBe(true);
      expect(validateScript(detail, p.script!)).toEqual([]);
      expect(compareRecord(detail, countScript(p.script!, detail), p.record)).toEqual([]);
      expect(simulateMatch(w, f, false, true, { awayGoals: false }).record).toEqual(p.record);
      found = p;
      break;
    }
    expect(found).toBeDefined();
  });
  it('a whole own season settles and the close reduces its material to season heat maps', () => {
    const w = handTo(world(), 4),
      year = w.year;
    // Financial failure is independent of this settlement integration case.
    w.cash = '1000000000000000000';
    const before = { morale: w.morale, fatigue: w.players.map((p) => p.fatigue) };
    const seen: MatchPlayback[] = [];
    while (w.round < SEASON_ROUNDS && !w.ended)
      advanceRound(
        w,
        (_, p) => {
          fullPlayback(p);
          seen.push(p);
        },
        false,
      );
    expect(w.ended).toBeUndefined();
    expect(w.round).toBe(SEASON_ROUNDS);
    const league = w.ownMatches.filter((m) => m.year === year && m.kind === 'league');
    expect(league.length).toBe(ownFixtures(w).length);
    const goals = league.reduce(
      (n, m) => n + (m.home === w.playerClub ? m.score.home : m.score.away),
      0,
    );
    expect(w.tables[w.playerClub]!.gf).toBe(goals);
    expect(
      w
        .scorerSeason!.players.filter((p) => p.club === w.playerClub)
        .reduce((n, p) => n + p.goals, 0),
    ).toBe(goals);
    expect(w.discipline).toBeDefined();
    expect(seen.flatMap((p) => p.record.incidents ?? []).some((x) => x.kind === 'injury')).toBe(
      true,
    );
    expect(w.players.some((p) => p.career[M.minutes]! > 0)).toBe(true);
    expect({ morale: w.morale, fatigue: w.players.map((p) => p.fatigue) }).not.toEqual(before);
    const heat: Record<string, number[]> = {};
    for (const m of w.ownMatches.filter((m) => m.year === year)) {
      expect(m.material).toBeDefined();
      m.players.forEach((p, line) => {
        const cells = (heat[p.id] ??= Array<number>(40).fill(0));
        for (let c = 0; c < 40; c++) cells[c]! += m.material!.heat[line * 40 + c]!;
      });
    }
    for (const id of Object.keys(heat)) if (!heat[id]!.some((n) => n > 0)) delete heat[id];
    closeSeason(w);
    const archived = w.history.find((s) => s.year === year)!;
    expect(archived.heat).toEqual(heat);
    expect(w.ownMatches.filter((m) => m.year === year).every((m) => !m.material)).toBe(true);
    expect(w.year).toBe(year + 1);
  });
  it("the owner's manager style, home build and talisman still count in preparation", () => {
    const plain = world(),
      context = structuredClone(plain);
    delete plain.manager.style;
    context.manager.style = 'positional';
    holdRows(plain, { build: {} });
    holdRows(context, { build: { fans: 'fortress' } });
    plain.owner!.traits = [];
    context.owner!.traits = ['talisman'];
    const f = ownFixtures(plain).find((f) => f.home === plain.playerClub)!;
    const a = prepareMatch(plain, f),
      b = prepareMatch(context, f);
    expect(b.strength[0]).toBeGreaterThan(a.strength[0]!);
    expect(b.profiles[0]!.pass).toBeCloseTo(a.profiles[0]!.pass + 2);
    expect(b.squads).toEqual(a.squads);
    const rosters = matchdayRosters(context, f, b, eraRules(f.year));
    const match = playAggregate(context, f, b, rosters);
    expect(match.input.sides[0].strength).toBe(b.strength[0]);
    expect(match.input.sides[0].profile).toEqual({
      possession: b.profiles[0]!.possession,
      pass: b.profiles[0]!.pass,
      shot: b.profiles[0]!.shot,
      defense: b.profiles[0]!.defense,
      pressure: b.profiles[0]!.pressure,
    });
  });
  it("other clubs' fixtures are untouched by the own club's script", () => {
    const w = world(),
      f = ownFixtures(w)[0]!;
    const others = w.fixtures.filter(
      (g) => g.round === f.round && g.home !== w.playerClub && g.away !== w.playerClub,
    );
    const watched = structuredClone(w),
      skipped = structuredClone(w);
    simulateMatch(watched, f, true);
    simulateMatch(skipped, f, false);
    for (const g of others) {
      const a = simulateMatch(watched, g, true),
        b = simulateMatch(skipped, g, false);
      expect(a.record).toEqual(b.record);
      expect(a.script).toBeUndefined();
      expect(a.record.material).toBeUndefined();
    }
  });
});
