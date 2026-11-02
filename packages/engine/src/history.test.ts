import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { World } from '../../contracts/src/types';
import { COUNTRIES, country } from '../../catalogs/src/index';
import { generateHistory, HISTORY_START, historyWorld, liveHistory } from './history';
import { seasonFrom, WARTIME } from './wartime';
import { closeSeason, prepareSeason } from './season';
import { currentDay, SEASON_END_DAY } from './calendar';
import { clamp } from './primitives';
import { stature, tierLevel } from './world';
import { evolveClubs } from './dynamics';
import { ownerSettleGap } from './owner';
import { openEmployment } from './person-careers';
import { founded, toLastRound } from './season.testkit';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

vi.mock('./owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./owner')>();
  return { ...actual, ownerSettleGap: vi.fn(actual.ownerSettleGap) };
});
vi.mock('./dynamics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dynamics')>();
  return { ...actual, evolveClubs: vi.fn(actual.evolveClubs) };
});

/**
 * An ownerless world on the first day of `year`'s season, on the pre-feature path: these tests
 * are about the seasons lived and archived, not the match model (→SAVE-23).
 */
function worldFrom(seed: string, year: number = HISTORY_START) {
  const w = historyWorld(seed, DISABLED_RELEASE);
  if (year === w.year) return w;
  w.year = year;
  prepareSeason(w);
  return w;
}
const archiveHash = (w: World) =>
  createHash('sha256')
    .update(JSON.stringify([w.history, w.clubs, w.lastChampions]))
    .digest('hex');

describe('the world before the takeover (→WORLD-13)', () => {
  it('is made in 1930 of professional clubs nobody owns, each at its division and stature', () => {
    const w = generateHistory('history-made', 1930);
    expect([w.year, currentDay(w), w.round, w.playerClub]).toEqual([1930, 0, 0, '']);
    expect(w.history).toEqual([]);
    expect(w.players).toEqual([]);
    // Every professional group at full capacity and no amateur level (→WORLD-5, WORLD-15); the
    // other associations' clubs stand for Europe only (→WORLD-1).
    const clubs = w.clubs.filter((c) => !c.id.startsWith('euro:'));
    for (const cp of COUNTRIES)
      expect(clubs.filter((c) => c.country === cp.code).length).toBe(
        cp.groups.flat().reduce((sum, size) => sum + size, 0),
      );
    expect(w.clubs.filter((c) => c.representative).every((c) => c.id.startsWith('euro:'))).toBe(
      true,
    );
    for (const club of clubs) {
      expect(club.tier).toBeLessThan(country(club.country).groups.length);
      const base = tierLevel(club.tier) + stature('history-made', club.id);
      expect(tierLevel(club.tier)).toBe(77 - 11 * club.tier);
      expect(club.strength).toBeGreaterThanOrEqual(clamp(Math.round(base - 3), 15, 92));
      expect(club.strength).toBeLessThanOrEqual(clamp(Math.round(base + 3), 15, 92));
      expect(club.identity).toBeDefined();
    }
    expect(w.fixtures.every((f) => f.year === 1930 && f.kind === 'league')).toBe(true);
    expect(() => generateHistory('history-made', 1935 as 1930)).toThrow();
  });

  it('makes the same world from the same seed, season by season', () => {
    const progress: number[] = [];
    const a = liveHistory(worldFrom('history-same'), 1931, (season) => progress.push(season));
    const b = liveHistory(worldFrom('history-same'), 1931);
    const other = liveHistory(worldFrom('history-other'), 1931);
    expect(progress).toEqual([1931]);
    expect([a.year, currentDay(a)]).toEqual([1931, 0]);
    expect(archiveHash(a)).toBe(archiveHash(b));
    expect(archiveHash(other)).not.toBe(archiveHash(a));
  });

  it('skips the war seasons and ages people through the gap', () => {
    const w = worldFrom('history-war', WARTIME.last);
    const person = Object.values(w.people ?? {}).find((p) => p.playing === 'active')!;
    // A coach of a club nobody owns, his contract running past the close.
    const coach = Object.values(w.people ?? {}).find((p) => p.id !== person.id)!;
    coach.playing = 'retired';
    const job = openEmployment(w, coach.id, 'assistant', w.clubs[0]!.id, { year: 1937, day: 0 });
    job.contractUntil = { year: 1940, day: 30 };
    const born = person.born;
    vi.mocked(evolveClubs).mockClear();
    vi.mocked(ownerSettleGap).mockClear();
    const progress: number[] = [];
    liveHistory(w, seasonFrom(1940), (season) => progress.push(season));
    expect(progress).toEqual([WARTIME.restart]);
    expect([w.year, currentDay(w)]).toEqual([WARTIME.restart, 0]);
    expect(w.history.map((h) => h.year)).toEqual([WARTIME.last]);
    expect(w.fixtures.every((f) => f.year === WARTIME.restart)).toBe(true);
    // Eight seasons older, by the calendar; the contract has as long left as at the close.
    expect(person.born).toBe(born);
    expect(w.year - person.born).toBe(WARTIME.last - born + 8);
    expect(job.contractUntil).toEqual({ year: 1947, day: 30 });
    // Clubs rise or fall once, at the 1938/39 close (→LEAGUE-10).
    expect(evolveClubs).toHaveBeenCalledTimes(1);
    expect(ownerSettleGap).toHaveBeenCalledTimes(1);
  });

  it('archives what HIST-2 keeps for every season played, and nothing of an own club', () => {
    const w = liveHistory(worldFrom('history-archive', 1954), 1956);
    const [first, season] = w.history;
    expect([first!.year, season!.year]).toEqual([1954, 1955]);
    for (const h of w.history) {
      // Every league club's final row; every country's champion, cup winner and cup final.
      expect(h.standings.length).toBe(w.clubs.filter((c) => !c.id.startsWith('euro:')).length);
      expect(h.champions.map((c) => c.country)).toEqual(COUNTRIES.map((c) => c.code));
      for (const c of h.champions) {
        expect(w.clubs.some((club) => club.id === c.club)).toBe(true);
        expect(c.cup).toBeTruthy();
        expect(c.cupFinal).toBeDefined();
      }
      // No own club played: no rank, matches, money, runs, scorers or ranks.
      expect([h.rank, h.played, h.points, h.manager, h.cash]).toEqual([0, 0, 0, '', '0']);
      expect(h.runs ?? []).toEqual([]);
      expect(h.ranks).toBeUndefined();
      expect(h.scorers).toBeUndefined();
      expect((h.brackets ?? []).every((b) => b.key !== 'cup')).toBe(true);
    }
    // The first European Cup (1955/56): its winner, standings and bracket are kept.
    const cup = season!.europe.find((e) => e.kind === 'ucl');
    expect(cup?.winner).toBeTruthy();
    expect(season!.brackets?.some((b) => b.key === 'ucl')).toBe(true);
    expect(w.events.filter((e) => e.kind === 'season')).toEqual([]);
  });
});

describe('a career that reaches the 1938/39 close', () => {
  it('crosses the war: the season after it is 1946/47 and contracts stand still', () => {
    const w = toLastRound(founded(WARTIME.last, DISABLED_RELEASE));
    const until = new Map(w.players.map((p) => [p.id, p.until]));
    const manager = w.manager.until;
    vi.mocked(evolveClubs).mockClear();
    vi.mocked(ownerSettleGap).mockClear();
    closeSeason(w);
    expect([w.year, currentDay(w)]).toEqual([WARTIME.restart, 0]);
    expect(w.history.at(-1)!.year).toBe(WARTIME.last);
    expect(w.manager.until).toBe(manager + 7);
    for (const p of w.players.filter((one) => one.status === 'active' && until.has(one.id)))
      expect(p.until).toBe(until.get(p.id)! + 7);
    expect(evolveClubs).toHaveBeenCalledTimes(1);
    expect(ownerSettleGap).toHaveBeenCalledExactlyOnceWith(
      w,
      { year: WARTIME.last, day: SEASON_END_DAY + 1 },
      { year: WARTIME.restart, day: 0 },
    );
  });
});
