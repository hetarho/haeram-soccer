/**
 * The world before the takeover (→WORLD-13): made in 1930 and lived by the day loop (→LEAGUE-11)
 * season by season to the chosen decade's first season, with nobody owning a club. Every fixture
 * is results-only (→MATCH-22, results-only.ts) and each close archives what HIST-2 keeps; the war
 * skips 1939/40–1945/46 (→WORLD-14). The same seed and decade make the same world.
 */
import type { World } from '../../contracts/src/types';
import { TAKEOVER_DECADES, type TakeoverDecade } from '../../contracts/src/owner';
import { CATALOG_HASH, CATALOG_VERSION, currency, priceIndex } from '../../catalogs/src/index';
import { advanceDays, prepareSeason } from './season';
import { currentDay, SEASON_END_DAY } from './calendar';
import { ENGINE_VERSION, generateClubs, makeManager } from './world';
import { hash } from './primitives';
import { installMissingIdentities } from './club-identity';
import { activateMatchModel, MATCH_MODEL_RELEASE, type MatchModelRelease } from './match-model';
import { seasonFrom } from './wartime';
import { DEFAULT_TICKET } from './presets';
import { booksOpen } from './books';

/** Every world is made in 1930, the first takeover decade (→WORLD-13). */
export const HISTORY_START = TAKEOVER_DECADES[0];

/**
 * 1 August 1930: every professional club of the playable countries (→WORLD-15), nobody's, on
 * the 1930/31 season's first day. The own-club fields wait for the takeover (→ECON-38): no
 * players, no money, and a placeholder manager who manages nothing. `release` is the internal
 * switch, which only tests and measurements pass (as for `takeOver`). So is `year`: production
 * always makes its world in 1930 (→WORLD-13); a test or measurement may make a fresh world, with
 * nothing lived before it, on a later season's first day.
 */
export function historyWorld(
  seed: string,
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
  year: number = HISTORY_START,
): World {
  if (!seed.trim() || seed.length > 80) throw new Error('시드를 확인해 주세요.');
  const clubs = generateClubs(seed);
  const code = clubs[0]!.country;
  const manager = makeManager(code, seed, year);
  const w: World = {
    schema: 1,
    engine: ENGINE_VERSION,
    catalog: CATALOG_VERSION,
    catalogHash: CATALOG_HASH,
    id: `world:${hash(`${seed}:history`)}`,
    seed,
    year,
    round: 0,
    revision: 0,
    playerClub: '',
    clubs,
    players: [],
    manager,
    tactic: manager.philosophy,
    fixtures: [],
    tables: {},
    ownMatches: [],
    history: [],
    events: [],
    cash: '0',
    income: '0',
    expense: '0',
    currency: currency(code, year).code,
    priceIndex: priceIndex(code, year).value,
    stadium: 0,
    trainingGround: 0,
    academyFacility: 0,
    ticket: DEFAULT_TICKET,
    campaigns: [],
    cupWinners: {},
    europe: [],
    lastChampions: [],
    receiptIds: [],
  };
  prepareSeason(w);
  booksOpen(w);
  // Each club's first manager starts with the world (→STAFF-17), not with a founding; the other
  // associations' clubs, which the season's preparation adds, included.
  w.managerMarket = {
    year,
    round: 0,
    free: [],
    clubs: Object.fromEntries(w.clubs.map((club) => [club.id, [0, year]])),
    serial: 0,
  };
  installMissingIdentities(w);
  // Fixtures are results-only while nobody owns a club (→MATCH-22); the released model keeps the
  // season's aggregates the Ballon d'Or reads (→SAVE-23, PLAYER-27) and is the takeover's model.
  activateMatchModel(w, release);
  return w;
}

/**
 * The ownerless world on the first day of `decade`'s first season — the 1946/47 restart for the
 * 1940s (→WORLD-14) — with every season before it played and archived. `onProgress` hears each
 * season reached, once a season, with the world standing on its first day (→WEB-115).
 */
export function generateHistory(
  seed: string,
  decade: TakeoverDecade,
  onProgress?: HistoryProgress,
): World {
  if (!TAKEOVER_DECADES.includes(decade)) throw new Error('인수 시대를 확인해 주세요.');
  return liveHistory(historyWorld(seed), seasonFrom(decade), onProgress);
}
/**
 * Hears a season reached and the world on its first day, the season just closed archived; it
 * reads the world and never changes it.
 */
export type HistoryProgress = (season: number, w: World) => void;
/**
 * Lives an ownerless world season by season, each to its close by the day loop, until `first`
 * is the season in play (its first day); `onProgress` hears each season reached.
 */
export function liveHistory(w: World, first: number, onProgress?: HistoryProgress) {
  while (w.year < first) {
    const season = w.year;
    // Exactly to the close: the day after the final round opens the next season (→LEAGUE-9).
    while (w.year === season) advanceDays(w, SEASON_END_DAY + 1 - currentDay(w), undefined, false);
    onProgress?.(w.year, w);
  }
  return w;
}
