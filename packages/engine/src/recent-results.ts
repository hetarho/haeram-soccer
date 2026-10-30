import type { Fixture, World } from '../../contracts/src/types';
import { RECENT_RESULT_LIMIT } from '../../contracts/src/recent-results';
import { fixtureDay } from './calendar';
import { compareIds } from './primitives';

type ResultSource = Pick<World, 'recentResults' | 'fixtures' | 'cups' | 'europe' | 'ownMatches'>;

function byDate(a: Fixture, b: Fixture) {
  return a.year - b.year || fixtureDay(a) - fixtureDay(b) || compareIds(a.id, b.id);
}

/** Keep only fixture facts; a recent result never retains full match material or player lines. */
function summary(f: Fixture): Fixture {
  return {
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
  };
}

function* settledFixtures(w: ResultSource) {
  for (const source of [
    w.fixtures,
    ...(w.cups ?? []).map((cup) => cup.fixtures),
    ...w.europe.map((tournament) => tournament.fixtures),
    w.ownMatches,
  ])
    for (const f of source) if (f.score) yield f;
}

/** Old saves fall back to their recorded fixtures; unavailable past results are never invented. */
export function recentClubResults(w: ResultSource, club: string): Fixture[] {
  const retained = w.recentResults?.[club];
  if (retained) return retained;
  const known = new Map<string, Fixture>();
  for (const f of settledFixtures(w))
    if (f.home === club || f.away === club) known.set(f.id, f);
  return [...known.values()].sort(byDate).slice(-RECENT_RESULT_LIMIT).map(summary);
}

/** An old save may close immediately after loading, before any new match starts tracking a club. */
export function retainRecentResults(w: World) {
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
}

/** All competition settlement paths use this, including promotion playoffs and helper results. */
export function recordRecentResult(w: World, fixture: Fixture) {
  if (!fixture.score) return;
  const result = summary(fixture);
  if (w.recentResults === undefined) retainRecentResults(w);
  w.recentResults ??= {};
  for (const club of [result.home, result.away]) {
    const previous = recentClubResults(w, club).filter((f) => f.id !== result.id);
    w.recentResults[club] = [...previous, result].sort(byDate).slice(-RECENT_RESULT_LIMIT);
  }
}
