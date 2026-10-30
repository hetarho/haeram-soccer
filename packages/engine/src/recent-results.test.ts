import { describe, expect, it } from 'vitest';
import type { Fixture, World } from '../../contracts/src/types';
import { RECENT_RESULT_LIMIT } from '../../contracts/src/recent-results';
import { recentClubResults, recordRecentResult, retainRecentResults } from './recent-results';

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
