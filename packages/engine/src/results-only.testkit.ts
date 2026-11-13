import type { Club, Fixture, World } from '../../contracts/src/types';
import { rating } from './world';
import released from './fixtures/results-only-released.json';
import { worldMarketFixture } from './world-market.testkit';

/**
 * Captured from pre-persisted-world commit 2b1bfe2e, seed results-only, season 1930.
 * The actual eight fixtures and their 176 starters stay fixed independently of world generation.
 */
export function releasedResultsWorld(): World {
  return {
    ...worldMarketFixture(),
    ...structuredClone(
      released as unknown as Pick<World, 'seed' | 'year' | 'fixtures' | 'clubs' | 'squads'>,
    ),
    playerClub: '',
    players: [],
    managerMarket: {
      year: released.year,
      round: 0,
      free: [],
      clubs: Object.fromEntries(released.clubs.map((club) => [club.id, [0, released.year]])),
      serial: 0,
    },
  };
}

/** Two top-flight clubs of one league as equal as the world has them, and `n` meetings. */
export function equalSides(w: World, n: number) {
  const top = w.clubs.filter((c) => c.country === 'ENG' && c.tier === 0 && !c.representative);
  let pair: [Club, Club] = [top[0]!, top[1]!];
  for (const a of top)
    for (const b of top)
      if (
        a !== b &&
        Math.abs(rating(w, a) - rating(w, b)) < Math.abs(rating(w, pair[0]) - rating(w, pair[1]))
      )
        pair = [a, b];
  const base = w.fixtures.find((f) => f.kind === 'league')!;
  const fixtures = Array.from({ length: n }, (_, i): Fixture => ({
    ...base,
    id: `results-only:${i}`,
    home: pair[0].id,
    away: pair[1].id,
  }));
  return { pair, fixtures };
}
