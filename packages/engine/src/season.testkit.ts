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
    const w = careerWorld({ country: code, seed: 'amateur-exchange' }, DISABLED_RELEASE);
    for (let n = 0; n < 46; n++) advanceRound(w, undefined, false);
    return w;
  });
  expect(w.round, `bankrupt: ${JSON.stringify(w.bankrupt)}`).toBe(46);
  return w;
}

/** Closes the season and reads who crossed between the last division and the amateur level. */
export function exchange(w: World) {
  const code = clubOf(w).country,
    groups = country(code).groups,
    last = groups.length - 1;
  const before = structuredClone(w);
  closeSeason(w);
  const was = new Map(before.clubs.map((c) => [c.id, c]));
  const ids = (clubs: Club[]) => clubs.map((c) => c.id).sort();
  const moved = (from: number, to: number, where: string = code) =>
    ids(
      w.clubs.filter((c) => c.country === where && was.get(c.id)!.tier === from && c.tier === to),
    );
  // Countries without a played amateur league send up their strongest amateur clubs.
  for (const cp of COUNTRIES.filter((cp) => !(before.lower && cp.code === code))) {
    const bottom = cp.groups.length - 1,
      places = cp.groups[bottom].length * 2;
    const strongest = before.clubs
      .filter((c) => c.country === cp.code && c.representative && c.tier === bottom + 1)
      .sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))
      .slice(0, places);
    expect(moved(bottom + 1, bottom, cp.code), cp.code).toEqual(ids(strongest));
    expect(moved(bottom, bottom + 1, cp.code), cp.code).toHaveLength(places);
  }
  // Nobody falls or climbs two levels in one close.
  for (const c of w.clubs)
    expect(Math.abs(c.tier - was.get(c.id)!.tier), c.id).toBeLessThanOrEqual(1);
  // Every group keeps its capacity.
  groups.forEach((sizes, tier) =>
    sizes.forEach((size, group) =>
      expect(
        w.clubs.filter(
          (c) => c.country === code && c.tier === tier && c.group === group && !c.representative,
        ),
        `${code}:${tier}:${group}`,
      ).toHaveLength(size),
    ),
  );
  return {
    last,
    up: moved(last + 1, last),
    down: moved(last, last + 1),
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
