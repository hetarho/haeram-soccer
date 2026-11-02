import { expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import type { World } from '../../contracts/src/types';
import { currency, priceIndex } from '../../catalogs/src/index';
import { takeOver } from './takeover';
import { divisionPlaces } from './club-value';
import { simulateSeason } from './founding';
import { squad } from './world';
import { generateHistory, historyWorld, liveHistory } from './history';
import { clubManager } from './managerMarket';
import { activeCoachingEmployment } from './person-careers';
import { isOwnSeason } from './player-state';
import {
  lastSeasonTier,
  lastSeasonTurnover,
  operatingExpensesAt,
  parachutePayment,
} from './finance';
import { ownerlessWorld, withBooks } from './ownerless.testkit';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

/** The club at `place` of a division of `code` (→OWNER-3's places). */
const atPlace = (w: World, code: string, tier: number, place: number) => {
  const places = divisionPlaces(w);
  return w.clubs.find(
    (c) => c.country === code && c.tier === tier && !c.representative && places.get(c.id) === place,
  )!;
};

it('plays a taken-over club’s first season with the existing loop', () => {
  const w = ownerlessWorld('takeover-season');
  const club = atPlace(w, 'ENG', 1, 4);
  // Two seasons of its wage bill in the bank and a debt to pay down.
  const wages = squad(w, club).reduce((sum, p) => sum + BigInt(p.wage), 0n);
  withBooks(w, club, { cash: (2n * wages).toString(), debt: wages.toString() });
  const year = w.year;
  takeOver(w, club.id, { tier: 'industrial', traits: [] }, 'youth-academy', DISABLED_RELEASE);
  simulateSeason(w);
  expect(w.bankrupt).toBeUndefined();
  expect(w.year).toBe(year + 1);
  const season = w.history.at(-1)!;
  expect(season).toMatchObject({ year, tier: 1, played: 46 });
  expect(w.ownMatches.filter((m) => m.year === year).length).toBeGreaterThanOrEqual(46);
  expect(w.events[0]).toMatchObject({ kind: 'takeover', year });
  expect(w.owner?.takeover).toMatchObject({ year, clubId: club.id });
  expect(w.playerClub).toBe(club.id);
  expect(() => validateWorld(structuredClone(w))).not.toThrow();
});

it('takes over a club of a generated world and plays its first season (→WORLD-13)', () => {
  // The world as a new game makes it: 1930, nobody's, ENG's money and a placeholder manager.
  const w = generateHistory('takeover-generated', 1930);
  const club = atPlace(w, 'GER', 1, 4),
    placeholder = w.manager.id;
  expect(w.managerMarket!.free).toEqual([]);
  takeOver(w, club.id, { tier: 'industrial', traits: [] });
  // The club's country's money and prices, its own manager and the season's free agents.
  expect(w.currency).toBe(currency('GER', 1930).code);
  expect(w.priceIndex).toBe(priceIndex('GER', 1930).value);
  expect(w.manager.id).not.toBe(placeholder);
  expect(w.manager.id).toBe(clubManager(w, club).id);
  expect(w.managerMarket!.free.length).toBeGreaterThanOrEqual(4);
  expect(() => validateWorld(structuredClone(w))).not.toThrow();
  simulateSeason(w);
  expect(w.bankrupt).toBeUndefined();
  expect(w.ended).toBeUndefined();
  expect(w.year).toBe(1931);
  expect(w.history.at(-1)).toMatchObject({ year: 1930, tier: 1, currency: w.currency });
  expect(w.history.at(-1)!.played).toBeGreaterThan(0);
  expect(() => validateWorld(structuredClone(w))).not.toThrow();
});

it('keeps the world’s season before the takeover apart from the club’s own (→HIST-2)', () => {
  // One season the world lived (1930/31), archived with every own-club field empty.
  const lived = liveHistory(historyWorld('takeover-archive', DISABLED_RELEASE), 1931);
  const [archived] = lived.history;
  const index = (id: string) => lived.clubs.findIndex((c) => c.id === id);
  const row = (id: string) => archived!.standings.find((r) => r[0] === index(id))!;

  // A club relegated from the top flight at that close is bought on 1 August 1931.
  const w = structuredClone(lived);
  const club = w.clubs.find(
    (c) => c.country === 'ENG' && c.tier === 1 && !c.representative && row(c.id)[1] === 0,
  )!;
  takeOver(w, club.id, { tier: 'oil', traits: [] }, undefined, DISABLED_RELEASE);
  expect(isOwnSeason(w, archived!)).toBe(false);
  // The relegation the world's standings show pays its parachute; no turnover of the club's is
  // known from a season nobody owned it in.
  expect(lastSeasonTier(w)).toBe(0);
  expect(BigInt(parachutePayment(w))).toBeGreaterThan(0n);
  expect(lastSeasonTurnover(w)).toBeUndefined();
  // Relegated at the world's last close: its first season runs at its new division's size.
  expect(w.operatingExpenses).toBe(operatingExpensesAt('ENG', 1931, 1));
  simulateSeason(w);
  expect(w.bankrupt).toBeUndefined();
  expect(w.events.find((e) => e.kind === 'parachute')?.detail).toMatch(/^1부 → 2부 강등/);
  const own = w.history.at(-1)!;
  expect(own).toMatchObject({ year: 1931, tier: 1 });
  expect(isOwnSeason(w, own)).toBe(true);
  // Its second season runs on its own first season's turnover (→ECON-30).
  expect(lastSeasonTurnover(w)).toBeDefined();
  expect(() => validateWorld(structuredClone(w))).not.toThrow();

  // A club whose coaches the world placed: they leave with the takeover (→OWNER-4).
  const coached = structuredClone(lived);
  const jobs = (x: World, id: string) =>
    activeCoachingEmployment(x).filter(({ job }) => job.club === id).length;
  const other = coached.clubs.find((c) => !c.representative && jobs(coached, c.id) > 0)!;
  takeOver(coached, other.id, { tier: 'oil', traits: [] }, undefined, DISABLED_RELEASE);
  expect(jobs(coached, other.id)).toBe(0);
  expect(() => validateWorld(structuredClone(coached))).not.toThrow();
});
