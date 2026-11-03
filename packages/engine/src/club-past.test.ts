import { describe, expect, it } from 'vitest';
import type { Club, SeasonArchive, World } from '../../contracts/src/types';
import type { OwnerState } from '../../contracts/src/owner';
import { archivedFinish, honoursBeforeOwner, seasonsBeforeOwner } from './club-past';

/** Synthetic: four English clubs and a Spanish one, only what the archive reads of them. */
const clubs = ['eng-a', 'eng-b', 'eng-c', 'eng-d', 'esp-a'].map(
  (id) => ({ id, country: id.startsWith('eng') ? 'ENG' : 'ESP' }) as Club,
);
const BOUGHT = 'eng-b',
  INDEX = 1;
/** A season the world archived with nobody owning a club: every own-club field empty (→WORLD-13). */
const archive = (year: number, fields: Partial<SeasonArchive> = {}): SeasonArchive => ({
  year,
  tier: 0,
  group: 0,
  rank: 0,
  points: 0,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  cash: '0',
  currency: 'GBP-LSD',
  income: '0',
  expense: '0',
  fans: 0,
  rating: 0,
  manager: '',
  metrics: Array<number>(12).fill(0),
  // [club, tier, group, points, goals for, goals against]
  standings: [
    [0, 0, 0, 50, 60, 30],
    [1, 0, 0, 50, 55, 30],
    [2, 1, 0, 40, 40, 40],
    [3, 1, 0, 45, 40, 40],
    [4, 0, 0, 70, 80, 20],
  ],
  champions: [
    { country: 'ENG', club: 'eng-a', cup: 'eng-c', cupFinal: { runnerUp: 'eng-d', score: [1, 0] } },
    { country: 'ESP', club: 'esp-a', cup: 'esp-a' },
  ],
  europe: [],
  ...fields,
});
const owned = (year: number) => ({ takeover: { year, clubId: BOUGHT } }) as unknown as OwnerState;
const world = (
  history: SeasonArchive[],
  takeover = 1960,
): Parameters<typeof seasonsBeforeOwner>[0] =>
  ({ clubs, history, playerClub: BOUGHT, owner: owned(takeover) }) as Pick<
    World,
    'clubs' | 'history' | 'playerClub' | 'owner'
  >;

describe('the bought club’s seasons before the owner (→HIST-21)', () => {
  it('places a club in its own country, division and group by points, goal difference and goals', () => {
    const standings = archive(1950).standings;
    // Level on points with eng-a, behind on goal difference; the Spanish leader is another league.
    expect(archivedFinish({ clubs }, standings, INDEX)).toEqual({ tier: 0, group: 0, place: 2 });
    expect(archivedFinish({ clubs }, standings, 3)).toEqual({ tier: 1, group: 0, place: 1 });
    expect(archivedFinish({ clubs }, [], INDEX)).toBeUndefined();
  });

  it('reads finish, title and the cup runs the archive keeps, oldest first', () => {
    const w = world([
      archive(1955, {
        standings: [
          [0, 0, 0, 40, 40, 40],
          [1, 0, 0, 60, 70, 20],
        ],
        champions: [
          {
            country: 'ENG',
            club: BOUGHT,
            cup: BOUGHT,
            cupFinal: { runnerUp: 'eng-a', score: [2, 1] },
          },
        ],
        europe: [
          { kind: 'ucl', name: 'European Cup', winner: BOUGHT, field: 16 },
          { kind: 'super', name: 'Super Cup', winner: 'eng-a', field: 2 },
        ],
      }),
      archive(1956, {
        champions: [
          {
            country: 'ENG',
            club: 'eng-a',
            cup: 'eng-c',
            cupFinal: { runnerUp: BOUGHT, score: [3, 0] },
          },
        ],
        europe: [
          {
            kind: 'ucl',
            name: 'European Cup',
            winner: 'esp-a',
            field: 16,
            final: { runnerUp: 'eng-a', score: [2, 0] },
          },
          { kind: 'cwc', name: 'Cup Winners Cup', winner: 'esp-a', field: 32 },
          {
            kind: 'uel',
            name: 'UEFA Cup',
            winner: 'esp-a',
            field: 32,
            standings: [[INDEX, 6, 3, 2, 1]],
          },
        ],
        brackets: [
          {
            key: 'ucl',
            rounds: [
              { label: '16강', round: 1, legs: 2, ties: [[INDEX, 4, 1, 0, 0, 2, 0]] },
              { label: '8강', round: 2, legs: 2, ties: [[INDEX, 0, 2, 2, 1, 0, 1]] },
              { label: '4강', round: 3, legs: 2, ties: [[0, 4, 1, 1, 1, 0, 1]] },
            ],
          },
        ],
      }),
      // A season it played in no league the archive kept.
      archive(1957, { standings: [[0, 0, 0, 50, 50, 50]] }),
    ]);
    expect(seasonsBeforeOwner(w)).toEqual([
      {
        year: 1955,
        finish: { tier: 0, group: 0, place: 1 },
        title: true,
        runs: [
          { key: 'cup', name: '잉글랜드 컵', reached: '결승', champion: true },
          { key: 'ucl', name: 'European Cup', reached: '결승', champion: true },
        ],
      },
      {
        year: 1956,
        finish: { tier: 0, group: 0, place: 2 },
        runs: [
          { key: 'cup', name: '잉글랜드 컵', reached: '결승' },
          { key: 'ucl', name: 'European Cup', reached: '8강' },
          { key: 'uel', name: 'UEFA Cup', reached: '조별 리그' },
        ],
      },
      { year: 1957, runs: [] },
    ]);
  });

  it('leaves out the owner’s own seasons, and a founded career has none', () => {
    const history = [archive(1958), archive(1959), { ...archive(1960), tier: 2, rank: 4 }];
    expect(seasonsBeforeOwner(world(history)).map((season) => season.year)).toEqual([1958, 1959]);
    // Taken over in the first archived season: nothing before it.
    expect(seasonsBeforeOwner(world(history, 1958))).toEqual([]);
    expect(seasonsBeforeOwner({ ...world(history), owner: undefined })).toEqual([]);
  });

  it('counts top-flight titles, domestic cups and continental titles', () => {
    expect(
      honoursBeforeOwner([
        {
          year: 1950,
          title: true,
          runs: [
            { key: 'cup', name: '잉글랜드 컵', reached: '결승', champion: true },
            { key: 'ucl', name: 'European Cup', reached: '결승', champion: true },
          ],
        },
        { year: 1951, runs: [{ key: 'cup', name: '잉글랜드 컵', reached: '결승' }] },
        {
          year: 1952,
          title: true,
          runs: [{ key: 'super', name: 'Super Cup', reached: '결승', champion: true }],
        },
      ]),
    ).toEqual({ league: 2, cup: 1, europe: 2 });
    expect(honoursBeforeOwner([])).toEqual({ league: 0, cup: 0, europe: 0 });
  });
});
