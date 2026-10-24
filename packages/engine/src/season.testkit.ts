import { legacySettings } from './responsibilities';
import { expect } from 'vitest';
import type { Club, CountryCode, World } from '../../contracts/src/index';
import { COUNTRIES, country, currency, priceIndex } from '../../catalogs/src/index';
import {
  advanceRound,
  closeSeason,
  clubOf,
  createWorld,
  finishCups,
  finishEurope,
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
  ownLeagueClubs,
  prepareSeason,
  ranked,
} from './index';
import { professionalStart } from './testing';
import { cachedWorld, simulatedWorld } from '../../../tests/fixtures/worlds';

/**
 * A club whose first season is `year`, with a squad and manager of that time, founded under
 * `release` (default the switch as it stands). An enabled release records the model before the
 * year moves, so a candidate founded in `year` is
 * `withCandidateModel(founded(year, DISABLED_RELEASE))`.
 */
export function founded(year?: number, release: MatchModelRelease = MATCH_MODEL_RELEASE) {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Archive Rovers',
      color: '#2a4d3a',
      seed: 'season-archive',
      level: 'normal' as const,
    },
    release,
  );
  w.settings = legacySettings(2);
  if (!year) return w;
  w.year = year;
  delete w.people;
  w.currency = currency('ENG', year).code;
  w.priceIndex = priceIndex('ENG', year).value;
  w.manager.since = year;
  w.manager.until = year + 3;
  for (const p of w.players) {
    p.born = year - 24;
    p.joined = year;
    p.until = year + 2;
  }
  prepareSeason(w);
  return w;
}

/** Plays `w` to its last round, unobserved, and stops before the close. */
export function toLastRound(w: World) {
  while (w.round < 46) advanceRound(w, undefined, false);
  return w;
}

/** The archive club's first season (amateur, professional or in 1980) at its last round. */
export function archiveLastRound(start: 'amateur' | 'professional' | 1980) {
  return cachedWorld(`archive-last-round-${start}`, () =>
    toLastRound(
      start === 1980
        ? founded(1980)
        : start === 'professional'
          ? professionalStart(founded())
          : founded(),
    ),
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

/** The exchange club founded in `code`. */
export const exchangeFounding = (code: CountryCode) => ({
  country: code,
  name: 'Archive Rovers',
  color: '#2a4d3a',
  seed: 'amateur-exchange',
  level: 'normal' as const,
});

/** A club founded in `code`, its first season (amateur unless `professional`) played to the last round. */
export function lastRound(code: CountryCode, professional = false) {
  // Exactly 46 round steps: one stays put once the club is bankrupt, which then never gets here.
  const w = professional
    ? cachedWorld(`professional-last-round-${code}`, () => {
        const w = professionalStart(createWorld(exchangeFounding(code)));
        for (let n = 0; n < 46; n++) advanceRound(w, undefined, false);
        return w;
      })
    : simulatedWorld(exchangeFounding(code), { rounds: 46 });
  expect(w.round, `bankrupt: ${JSON.stringify(w.bankrupt)}`).toBe(46);
  return w;
}

/**
 * Orders the amateur table with the own club `rank`th and the others from the weakest down, so the
 * table and the strength order disagree; returns the table.
 */
export function standAt(w: World, rank: number) {
  const order = ownLeagueClubs(w)
    .filter((c) => c.id !== w.playerClub)
    .sort((a, b) => a.strength - b.strength || (a.id < b.id ? -1 : 1));
  order.splice(rank - 1, 0, clubOf(w));
  order.forEach((c, i) => (w.tables[c.id].points = 100 - i * 2));
  expect(ranked(w, order)).toEqual(order);
  return order.map((c) => c.id);
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
