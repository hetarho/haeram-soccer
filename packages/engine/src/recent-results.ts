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

/**
 * Every fixture list a settled result can sit in, in scan order: league fixtures, each cup, each
 * European tournament, then own matches. A later list's fixture replaces an earlier one with the
 * same id in place, so this order decides which copy a scan keeps.
 */
function resultSources(w: ResultSource): Fixture[][] {
  return [
    w.fixtures,
    ...(w.cups ?? []).map((cup) => cup.fixtures),
    ...w.europe.map((tournament) => tournament.fixtures),
    w.ownMatches,
  ];
}

/**
 * Old saves fall back to their recorded fixtures; unavailable past results are never invented.
 * A new career takes this path once per club on its first matchday, so the scan is plain indexed
 * loops rather than a generator resumed per fixture.
 */
export function recentClubResults(w: ResultSource, club: string): Fixture[] {
  const retained = w.recentResults?.[club];
  if (retained) return retained;
  const known = new Map<string, Fixture>();
  const sources = resultSources(w);
  for (let s = 0; s < sources.length; s++) {
    const source = sources[s]!;
    for (let i = 0; i < source.length; i++) {
      const f = source[i]!;
      if (f.score && (f.home === club || f.away === club)) known.set(f.id, f);
    }
  }
  return [...known.values()].sort(byDate).slice(-RECENT_RESULT_LIMIT).map(summary);
}

/** An old save may close immediately after loading, before any new match starts tracking a club. */
export function retainRecentResults(w: World) {
  const untracked = new Map<string, Map<string, Fixture>>();
  for (const source of resultSources(w))
    for (const f of source) {
      if (!f.score) continue;
      for (const club of [f.home, f.away]) {
        if (w.recentResults?.[club]) continue;
        let results = untracked.get(club);
        if (!results) untracked.set(club, (results = new Map()));
        results.set(f.id, f);
      }
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
    const results = recentClubResults(w, club).filter((f) => f.id !== result.id);
    // Every list is kept in date order, so a result dated at or after its last entry is appended
    // where the sort would leave it; an earlier one sorts the list as before.
    const last = results[results.length - 1];
    results.push(result);
    if (last && byDate(last, result) > 0) results.sort(byDate);
    w.recentResults[club] = results.slice(-RECENT_RESULT_LIMIT);
  }
}
