import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { fixtureDay } from '../../../../packages/engine/src/calendar';
export function ownSeasonFixtures(w: World) {
  const unique = new Map<string, Fixture>();
  for (const f of [...w.fixtures, ...w.europe.flatMap((t) => t.fixtures), ...w.ownMatches]) {
    if (f.year !== w.year || (f.home !== w.playerClub && f.away !== w.playerClub)) continue;
    if (!unique.has(f.id) || f.score) unique.set(f.id, f);
  }
  return [...unique.values()].sort(
    (a, b) => fixtureDay(a) - fixtureDay(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
