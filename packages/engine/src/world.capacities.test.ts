import { describe, it, expect } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import { FOUNDING_YEAR } from './index';
import { DISABLED_RELEASE, simulatedWorld } from '../../../tests/fixtures/worlds';
import { assertCapacities, input } from './world.testkit';
describe('world progression', () => {
  it('conserves league capacities across promotions and retains records', () => {
    // The world after each of four seasons (checks only read it, so one chain plays them all), on
    // the pre-feature path: league capacities, not the match model, are the subject.
    const seasons = [1, 2, 3, 4].map((seasons) =>
      simulatedWorld(input, { seasons }, DISABLED_RELEASE),
    );
    for (const after of seasons) {
      assertCapacities(after);
      validateWorld(after);
    }
    const w = seasons[3];
    expect(new Set(w.ownMatches.map((m) => m.id)).size).toBe(w.ownMatches.length);
    expect(w.ownMatches.length).toBeLessThan(300);
    expect(w.history).toHaveLength(4);
    for (const season of w.history) {
      const leagueMatches = w.ownMatches.filter(
        (match) => match.year === season.year && ['league', 'lower'].includes(match.kind),
      );
      expect(leagueMatches).toHaveLength(season.played);
      expect(
        leagueMatches.reduce(
          (sum, match) => sum + (match.home === w.playerClub ? match.score.home : match.score.away),
          0,
        ),
      ).toBe(season.gf);
    }
    expect(w.year).toBe(FOUNDING_YEAR + 4);
    expect(w.history[0].year).toBe(FOUNDING_YEAR);
  });
});
