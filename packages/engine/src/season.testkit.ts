import { expect } from 'vitest';
import type { Club, CountryCode, World } from '../../contracts/src/index';
import { COUNTRIES, country } from '../../catalogs/src/index';
import {
  advanceRound,
  closeSeason,
  clubOf,
  finishCups,
  finishEurope,
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
  ranked,
} from './index';
import { staffAuthority } from './testing';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { careerWorld } from './career.testkit';

/**
 * A club taken over on `year`'s first day (default `CAREER_YEAR`) under `release` (default the
 * switch as it stands), in a world made fresh that season. An enabled release records the model at
 * the takeover, so a candidate of `year` is `withCandidateModel(founded(year, DISABLED_RELEASE))`.
 */
export function founded(year?: number, release: MatchModelRelease = MATCH_MODEL_RELEASE) {
  const w = careerWorld({ seed: 'season-archive', year }, release);
  w.settings = staffAuthority(2);
  return w;
}

/** Plays `w` to its last round, unobserved, and stops before the close. */
export function toLastRound(w: World) {
  while (w.round < 46) advanceRound(w, undefined, false);
  return w;
}

/**
 * The archive club's first season (taken over in `CAREER_YEAR` or in 1980) at its last round, on
 * the pre-feature path: the season's archive, not the match model, is the subject.
 */
export function archiveLastRound(start: 'professional' | 1980) {
  return cachedWorld(`archive-last-round-${start}`, () =>
    toLastRound(founded(start === 1980 ? 1980 : undefined, DISABLED_RELEASE)),
  );
}

/** Plays a season to its last round and closes it; `live` is the world as the close archived it. */
export function closedSeason(w: World) {
  toLastRound(w);
  const live = structuredClone(w);
  finishCups(live);
  finishEurope(live);
  closeSeason(w);
  return { w, live, season: w.history.at(-1)! };
}

/**
 * A club of the lowest professional division taken over in `code`, its first season played to the
 * last round, on the pre-feature path: promotion and relegation, not the match model, are the
 * subject.
 */
export function lastRound(code: CountryCode) {
  // Exactly 46 round steps: one stays put once the club is bankrupt, which then never gets here.
  const w = cachedWorld(`professional-last-round-${code}`, () => {
    const w = careerWorld({ country: code, seed: 'lowest-division' }, DISABLED_RELEASE);
    for (let n = 0; n < 46; n++) advanceRound(w, undefined, false);
    return w;
  });
  expect(w.round, `bankrupt: ${JSON.stringify(w.bankrupt)}`).toBe(46);
  return w;
}

/**
 * Puts the own club, of the lowest professional division, last in its group with no points,
 * closes the season and reads who crossed the last division's boundary (→LEAGUE-16). Every group
 * of every country keeps its capacity (→LEAGUE-2), nobody moves two levels and nobody leaves the
 * professional game; `mood` is 팬 민심 before the close.
 */
export function closeLowest(w: World) {
  const own = clubOf(w),
    code = own.country,
    groups = country(code).groups,
    last = groups.length - 1;
  expect(own.tier).toBe(last);
  const table = w.tables[own.id]!;
  w.tables[own.id] = { ...table, won: 0, drawn: 0, lost: table.played, gf: 0, ga: 99, points: 0 };
  const before = structuredClone(w),
    mood = w.owner!.fanMood;
  closeSeason(w);
  const was = new Map(before.clubs.map((c) => [c.id, c]));
  const ids = (clubs: Club[]) => clubs.map((c) => c.id).sort();
  const moved = (from: number, to: number) =>
    ids(w.clubs.filter((c) => c.country === code && was.get(c.id)!.tier === from && c.tier === to));
  for (const c of w.clubs) {
    expect(Math.abs(c.tier - was.get(c.id)!.tier), c.id).toBeLessThanOrEqual(1);
    if (!c.representative) expect(c.tier, c.id).toBeLessThan(country(c.country).groups.length);
  }
  for (const cp of COUNTRIES)
    cp.groups.forEach((sizes, tier) =>
      sizes.forEach((size, group) =>
        expect(
          w.clubs.filter(
            (c) =>
              c.country === cp.code && c.tier === tier && c.group === group && !c.representative,
          ),
          `${cp.code}:${tier}:${group}`,
        ).toHaveLength(size),
      ),
    );
  return {
    last,
    mood,
    up: moved(last, last - 1),
    down: moved(last - 1, last),
    // The bottom two of each last-division group in the season just played.
    bottom: ids(
      groups[last].flatMap((_, group) =>
        ranked(
          before,
          before.clubs.filter(
            (c) => c.country === code && c.tier === last && c.group === group && !c.representative,
          ),
        ).slice(-2),
      ),
    ),
  };
}
