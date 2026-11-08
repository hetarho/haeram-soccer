import { describe, expect, it } from 'vitest';
import type { Fixture, World } from '../../contracts/src/types';
import { RECENT_RESULT_LIMIT } from '../../contracts/src/recent-results';
import { fixtureDay } from './calendar';
import { compareIds } from './primitives';
import { recentClubResults, recordRecentResult, retainRecentResults } from './recent-results';

/** The pre-T725 generator scan, kept verbatim as the reference the indexed loops must match. */
const reference = (() => {
  const byDate = (a: Fixture, b: Fixture) =>
    a.year - b.year || fixtureDay(a) - fixtureDay(b) || compareIds(a.id, b.id);
  const summary = (f: Fixture): Fixture => ({
    id: f.id,
    year: f.year,
    round: f.round,
    kind: f.kind,
    home: f.home,
    away: f.away,
    country: f.country,
    groupKey: f.groupKey,
    ...(f.score ? { score: { ...f.score } } : {}),
    ...(f.shootout ? { shootout: { ...f.shootout } } : {}),
  });
  function* settledFixtures(w: World) {
    for (const source of [
      w.fixtures,
      ...(w.cups ?? []).map((cup) => cup.fixtures),
      ...w.europe.map((tournament) => tournament.fixtures),
      w.ownMatches,
    ])
      for (const f of source) if (f.score) yield f;
  }
  return {
    recentClubResults(w: World, club: string): Fixture[] {
      const retained = w.recentResults?.[club];
      if (retained) return retained;
      const known = new Map<string, Fixture>();
      for (const f of settledFixtures(w))
        if (f.home === club || f.away === club) known.set(f.id, f);
      return [...known.values()].sort(byDate).slice(-RECENT_RESULT_LIMIT).map(summary);
    },
    retainRecentResults(w: World) {
      const untracked = new Map<string, Map<string, Fixture>>();
      for (const f of settledFixtures(w))
        for (const club of [f.home, f.away]) {
          if (w.recentResults?.[club]) continue;
          let results = untracked.get(club);
          if (!results) untracked.set(club, (results = new Map()));
          results.set(f.id, f);
        }
      for (const [club, results] of untracked) {
        w.recentResults ??= {};
        w.recentResults[club] = [...results.values()]
          .sort(byDate)
          .slice(-RECENT_RESULT_LIMIT)
          .map(summary);
      }
    },
  };
})();

const fixture = (year: number, round: number, kind: Fixture['kind'] = 'league'): Fixture => ({
  id: `${year}:${kind}:${round}`,
  year,
  round,
  kind,
  home: 'a',
  away: 'b',
  country: 'ENG',
  groupKey: 'ENG:1:0',
  score: { home: 2, away: 1 },
});
const source = () =>
  ({
    year: 1959,
    fixtures: [],
    ownMatches: [],
    cups: [],
    europe: [],
  }) as unknown as World;

describe('retained club results', () => {
  it('keeps the latest ten for both clubs through a season rollover, in actual match order', () => {
    const w = source();
    for (let round = 1; round <= 12; round++) recordRecentResult(w, fixture(1959, round));
    const previous = w.recentResults!.a;
    w.year = 1960;
    w.fixtures = [];
    w.cups = [];
    w.europe = [];
    recordRecentResult(w, fixture(1960, 1));
    // A delayed settlement for the midweek cup still sorts before that weekend's league match.
    recordRecentResult(w, fixture(1960, 1, 'cup'));
    recordRecentResult(w, fixture(1960, 2, 'europe'));
    recordRecentResult(w, fixture(1960, 3, 'playoff'));
    recordRecentResult(w, fixture(1960, 3, 'playoff'));
    expect(recentClubResults(w, 'a').map((f) => f.id)).toEqual([
      ...Array.from({ length: 6 }, (_, i) => `1959:league:${i + 7}`),
      '1960:cup:1',
      '1960:league:1',
      '1960:europe:2',
      '1960:playoff:3',
    ]);
    expect(w.recentResults!.b).toEqual(w.recentResults!.a);
    // Publication can retain an old array while the next settlement replaces its current value.
    expect(previous).toHaveLength(RECENT_RESULT_LIMIT);
    expect(previous.at(-1)!.year).toBe(1959);
  });

  it('seeds an older save from actual known results without filling gaps with invented matches', () => {
    const w = source();
    w.fixtures = Array.from({ length: 8 }, (_, i) => fixture(1959, i + 1));
    w.cups = [{ fixtures: [w.fixtures[0]!] }] as World['cups'];
    expect(recentClubResults(w, 'b')).toHaveLength(8);
    expect(w.recentResults).toBeUndefined();
    recordRecentResult(w, fixture(1959, 9));
    expect(recentClubResults(w, 'b')).toHaveLength(9);
    expect(recentClubResults(w, 'a').map((f) => f.id)).toEqual([
      ...w.fixtures.map((f) => f.id),
      '1959:league:9',
    ]);
    const unplayed = { ...fixture(1959, 10), score: undefined };
    recordRecentResult(w, unplayed);
    expect(recentClubResults(w, 'b')).toHaveLength(9);
  });

  it('keeps a detached fixture summary and no player or match-material payload', () => {
    const w = source();
    const played = { ...fixture(1959, 1), shootout: { home: 4, away: 3 }, players: ['large'] };
    recordRecentResult(w, played);
    played.score!.home = 9;
    played.shootout.home = 8;
    const [saved] = recentClubResults(w, 'b');
    expect(saved!.score).toEqual({ home: 2, away: 1 });
    expect(saved!.shootout).toEqual({ home: 4, away: 3 });
    expect(saved).not.toHaveProperty('players');
  });

  it('scans league, cup, European and own fixtures exactly as the generator scan did', () => {
    const clubs = ['a', 'b', 'c', 'd', 'e', 'f'];
    const game = (
      id: string,
      round: number,
      kind: Fixture['kind'],
      home: string,
      away: string,
      goals?: [number, number],
    ): Fixture => ({
      id,
      year: 1959,
      round,
      kind,
      home,
      away,
      country: 'ENG',
      groupKey: kind === 'league' ? 'ENG:1:0' : kind,
      ...(goals ? { score: { home: goals[0], away: goals[1] } } : {}),
    });
    const w = source();
    w.fixtures = Array.from({ length: 36 }, (_, i) =>
      game(`L${i}`, 1 + (i >> 2), 'league', clubs[i % 6]!, clubs[(i * 5 + 1) % 6]!, [
        i % 4,
        (i * 3) % 5,
      ]),
    );
    w.fixtures[5]!.score = undefined;
    w.fixtures[17]!.score = undefined;
    // A same-id fixture in a later list replaces the earlier copy where it was first seen.
    w.cups = [
      {
        fixtures: [
          game('C0', 2, 'cup', 'a', 'c', [1, 1]),
          game('L3', 1, 'league', 'd', 'e', [5, 0]),
        ],
      },
      { fixtures: [{ ...game('C1', 4, 'cup', 'b', 'a', [0, 0]), shootout: { home: 4, away: 5 } }] },
    ] as World['cups'];
    w.europe = [
      { fixtures: [game('E0', 3, 'europe', 'a', 'f', [2, 2]), game('E1', 6, 'europe', 'c', 'a')] },
      { fixtures: [game('C0', 2, 'cup', 'a', 'c', [3, 2])] },
    ] as World['europe'];
    w.ownMatches = [
      { ...game('L30', 8, 'league', 'a', 'b', [4, 4]), players: ['large'] },
    ] as unknown as World['ownMatches'];

    for (const club of [...clubs, 'unknown'])
      expect(JSON.stringify(recentClubResults(w, club))).toBe(
        JSON.stringify(reference.recentClubResults(w, club)),
      );
    expect(recentClubResults(w, 'a')).toHaveLength(RECENT_RESULT_LIMIT);
    expect(recentClubResults(w, 'c').find((f) => f.id === 'C0')!.score).toEqual({
      home: 3,
      away: 2,
    });
    expect(recentClubResults(w, 'a').find((f) => f.id === 'L30')!.score).toEqual({
      home: 4,
      away: 4,
    });

    const scanned = structuredClone(w);
    const expected = structuredClone(w);
    scanned.recentResults = expected.recentResults = { b: [] };
    retainRecentResults(scanned);
    reference.retainRecentResults(expected);
    expect(JSON.stringify(scanned.recentResults)).toBe(JSON.stringify(expected.recentResults));
  });

  it('retains untracked clubs when an older save closes before playing another match', () => {
    const w = source();
    w.fixtures = Array.from({ length: 12 }, (_, i) => fixture(1959, i + 1));
    retainRecentResults(w);
    w.fixtures = [];
    w.year = 1960;
    expect(recentClubResults(w, 'b').map((f) => f.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `1959:league:${i + 3}`),
    );
  });
});
