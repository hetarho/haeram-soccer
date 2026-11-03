import { describe, expect, it } from 'vitest';
import type { BallonDorPlace, Club, SeasonArchive } from '../../contracts/src/types';
import { generationDigestSchema } from '../../contracts/src/schema';
import { seasonDigest } from './generation-digest';

/** Three associations in WORLD-1's order, enough for the tie rule. */
const ASSOCIATIONS = ['ENG', 'ESP', 'GER'];
const club = (id: string, country: string, elo?: number, strength = 60): Club =>
  ({ id, name: `${id} FC`, country, strength, ...(elo !== undefined ? { elo } : {}) }) as Club;
const CLUBS = [
  club('arsenal', 'ENG', 1700),
  club('madrid', 'ESP', 1800),
  club('bayern', 'GER', 1750),
  club('euro:0', 'HUN', 1600),
];

interface Season {
  /** League champions by association; every other association's champion is new each season. */
  champions?: Record<string, string>;
  cups?: Record<string, string>;
  ucl?: string;
  /** The European Cup lineage's name that season. */
  uclName?: string;
  uel?: string;
  cwc?: string;
  superCup?: string;
  /** The 발롱도르 winner's ID, archived as the podium's first place. */
  ballon?: string;
}
/** A hand-built archive holding only what the digest reads. */
function archive(year: number, s: Season = {}): SeasonArchive {
  const europe = [
    ['super', 'Super Cup', s.superCup],
    ['uel', 'UEFA Cup', s.uel],
    ['cwc', 'Cup Winners Cup', s.cwc],
    ['ucl', s.uclName ?? 'European Cup', s.ucl],
  ]
    .filter(([, , winner]) => winner)
    .map(([kind, name, winner]) => ({ kind: kind!, name: name!, winner: winner!, field: 32 }));
  const podium = s.ballon
    ? [{ id: s.ballon, name: `Player ${s.ballon}`, club: 'madrid' } as BallonDorPlace]
    : undefined;
  return {
    year,
    champions: ASSOCIATIONS.map((country) => ({
      country,
      club: s.champions?.[country] ?? `${country}:${year}`,
      cup: s.cups?.[country] ?? `${country}:cup:${year}`,
    })),
    europe,
    ...(podium ? { ballonDor: podium } : {}),
  } as SeasonArchive;
}
/** The world on the first day of the season after its last archive (or `year`). */
const world = (history: SeasonArchive[], year = history.at(-1)!.year + 1, clubs = CLUBS) => ({
  year,
  clubs,
  history,
});
/** Archives for `from`…`to`, each built by `of(year)`. */
const seasons = (from: number, to: number, of: (year: number) => Season = () => ({})) =>
  Array.from({ length: to - from + 1 }, (_, i) => archive(from + i, of(from + i)));
const featOf = (history: SeasonArchive[], year?: number) =>
  seasonDigest(world(history, year))?.feat;

describe('seasonDigest (→WEB-115)', () => {
  it('reads nothing before the first close', () => {
    expect(seasonDigest(world([], 1930))).toBeUndefined();
  });

  it('lists the world’s ten best clubs by Club Elo, strength-derived Elo included', () => {
    const clubs = Array.from({ length: 12 }, (_, i) =>
      club(`c${i}`, 'ENG', i === 3 ? undefined : 1500 + i * 10, 80),
    );
    // c3 has no recorded Elo: strength 80 reads 1350 + 20 × 16 = 1670, the best.
    const digest = seasonDigest(world([archive(1930)], 1931, clubs))!;
    expect(digest.elo.map((row) => row.id)).toEqual([
      'c3',
      'c11',
      'c10',
      'c9',
      'c8',
      'c7',
      'c6',
      'c5',
      'c4',
      'c2',
    ]);
    expect(digest.elo[0]).toEqual({ id: 'c3', name: 'c3 FC', country: 'ENG', elo: 1670 });
    // Equal ratings keep the world's order.
    const tied = seasonDigest(
      world([archive(1930)], 1931, [club('b', 'ENG', 1500), club('a', 'ESP', 1500)]),
    )!;
    expect(tied.elo.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('names the champions, the European winners without the Super Cup, and the season', () => {
    const digest = seasonDigest(
      world([
        archive(1965, {
          champions: { ENG: 'arsenal', ESP: 'madrid', GER: 'bayern' },
          ucl: 'madrid',
          uel: 'euro:0',
          cwc: 'bayern',
          superCup: 'arsenal',
        }),
      ]),
    )!;
    expect(digest.season).toBe(1966);
    expect(digest.closed).toBe(1965);
    expect(digest.champions).toEqual([
      { country: 'ENG', club: { id: 'arsenal', name: 'arsenal FC', country: 'ENG' } },
      { country: 'ESP', club: { id: 'madrid', name: 'madrid FC', country: 'ESP' } },
      { country: 'GER', club: { id: 'bayern', name: 'bayern FC', country: 'GER' } },
    ]);
    expect(digest.europe.map(({ kind, name, club }) => [kind, name, club.name])).toEqual([
      ['ucl', 'European Cup', 'madrid FC'],
      ['cwc', 'Cup Winners Cup', 'bayern FC'],
      ['uel', 'UEFA Cup', 'euro:0 FC'],
    ]);
    expect(generationDigestSchema.safeParse(digest).success).toBe(true);
  });

  it('gives no 발롱도르 before 1955/56 and the winner from it', () => {
    expect(seasonDigest(world([archive(1954, { ballon: 'p1' })]))!.ballonDor).toBeUndefined();
    expect(seasonDigest(world([archive(1955, { ballon: 'p1' })]))!.ballonDor).toEqual({
      name: 'Player p1',
      club: { id: 'madrid', name: 'madrid FC', country: 'ESP' },
    });
  });

  describe('feats', () => {
    it('cards the war on the 1946 restart, the first season after the 1938/39 close', () => {
      const history = seasons(1935, 1938);
      expect(featOf(history, 1946)).toEqual({ kind: 'war' });
      expect(seasonDigest(world(history, 1946))!.closed).toBe(1938);
      // Without the gap no war.
      expect(featOf(history, 1939)).toBeUndefined();
    });

    it('cards a treble of league, domestic cup and the European Cup', () => {
      const history = [
        archive(1960, { ucl: 'bayern' }),
        archive(1961, { champions: { ESP: 'madrid' }, cups: { ESP: 'madrid' }, ucl: 'madrid' }),
      ];
      expect(featOf(history)).toEqual({
        kind: 'treble',
        club: { id: 'madrid', name: 'madrid FC', country: 'ESP' },
        competition: 'European Cup',
      });
      // The UEFA Cup makes no treble.
      expect(
        featOf([
          archive(1980, {
            champions: { ESP: 'madrid' },
            cups: { ESP: 'madrid' },
            uel: 'madrid',
            ucl: 'bayern',
          }),
        ]),
      ).toMatchObject({ kind: 'europe-first', club: { id: 'bayern' } });
    });

    it('cards the European Cup kept two and three seasons running, under its era name', () => {
      const two = [
        archive(1990, { ucl: 'bayern' }),
        archive(1991, { ucl: 'madrid' }),
        archive(1992, { ucl: 'madrid', uclName: 'Champions League' }),
      ];
      expect(featOf(two)).toEqual({
        kind: 'europe-two',
        club: { id: 'madrid', name: 'madrid FC', country: 'ESP' },
        competition: 'Champions League',
        count: 2,
      });
      const three = seasons(1956, 1958, () => ({ ucl: 'madrid' }));
      expect(featOf(three)).toMatchObject({ kind: 'europe-three', count: 3 });
      expect(featOf([...three, archive(1959, { ucl: 'madrid' })])).toMatchObject({
        kind: 'europe-three',
        count: 4,
      });
    });

    it('cards a club’s first European Cup, the first final included', () => {
      expect(featOf([archive(1955, { ucl: 'madrid' })])).toMatchObject({
        kind: 'europe-first',
        club: { id: 'madrid' },
      });
      // A second, not consecutive, title is no first and no run.
      expect(
        featOf([
          archive(1955, { ucl: 'madrid' }),
          archive(1956, { ucl: 'bayern' }),
          archive(1957, { ucl: 'madrid' }),
        ]),
      ).toBeUndefined();
    });

    it('cards a third 발롱도르 in a row', () => {
      const history = seasons(1960, 1962, () => ({ ballon: 'p9' }));
      expect(featOf(history)).toEqual({
        kind: 'ballon-three',
        player: 'Player p9',
        club: { id: 'madrid', name: 'madrid FC', country: 'ESP' },
        count: 3,
      });
      expect(featOf(history.slice(0, 2))).toBeUndefined();
      // Podiums archived before 1955/56 count for nothing.
      expect(featOf(seasons(1953, 1955, () => ({ ballon: 'p9' })))).toBeUndefined();
    });

    it('cards a league run at five, then only when it becomes the country’s longest', () => {
      const run = (from: number, to: number, holder: string) =>
        seasons(from, to, () => ({ champions: { ENG: holder } }));
      expect(featOf(run(1930, 1933, 'arsenal'))).toBeUndefined();
      expect(featOf(run(1930, 1934, 'arsenal'))).toEqual({
        kind: 'league-run',
        club: { id: 'arsenal', name: 'arsenal FC', country: 'ENG' },
        count: 5,
      });
      // Already the country's longest at five: the sixth is not carded again.
      expect(featOf(run(1930, 1935, 'arsenal'))).toBeUndefined();
      // Against an earlier run of six: the seventh breaks the record and is carded, the sixth not.
      const earlier = [...run(1950, 1955, 'chelsea'), archive(1956)];
      expect(featOf([...earlier, ...run(1957, 1961, 'arsenal')])).toMatchObject({ count: 5 });
      expect(featOf([...earlier, ...run(1957, 1962, 'arsenal')])).toBeUndefined();
      expect(featOf([...earlier, ...run(1957, 1963, 'arsenal')])).toMatchObject({
        kind: 'league-run',
        count: 7,
      });
      expect(featOf([...earlier, ...run(1957, 1964, 'arsenal')])).toBeUndefined();
    });

    it('lets the war gap break no run: consecutive archives are consecutive', () => {
      const history = [
        ...seasons(1935, 1938, () => ({ champions: { GER: 'bayern' } })),
        archive(1946, { champions: { GER: 'bayern' } }),
      ];
      expect(featOf(history, 1947)).toMatchObject({ kind: 'league-run', count: 5 });
    });

    it('shows the greatest feat of a season with several', () => {
      // Treble, European Cup back to back and a league run of five: the treble.
      const several = [
        ...seasons(1960, 1963, () => ({ champions: { ESP: 'madrid' } })),
        archive(1964, { champions: { ESP: 'madrid' }, ucl: 'madrid' }),
        archive(1965, { champions: { ESP: 'madrid' }, cups: { ESP: 'madrid' }, ucl: 'madrid' }),
      ];
      expect(featOf(several)).toMatchObject({ kind: 'treble' });
      // A third 발롱도르 in a row comes before the European Cup kept twice.
      const ballon = [
        archive(1970, { ballon: 'p1' }),
        archive(1971, { ballon: 'p1', ucl: 'bayern' }),
        archive(1972, { ballon: 'p1', ucl: 'bayern' }),
      ];
      expect(featOf(ballon)).toMatchObject({ kind: 'ballon-three' });
      // The war comes before everything.
      expect(
        featOf(
          several.map((a, i) => ({ ...a, year: 1933 + i })),
          1946,
        ),
      ).toEqual({
        kind: 'war',
      });
      // A first European Cup comes before a league run.
      const first = [
        ...seasons(1960, 1963, () => ({ champions: { GER: 'bayern' } })),
        archive(1964, { champions: { GER: 'bayern' }, ucl: 'arsenal' }),
      ];
      expect(featOf(first)).toMatchObject({ kind: 'europe-first', club: { id: 'arsenal' } });
    });

    it('breaks a tie within one kind by WORLD-1’s order', () => {
      const both = seasons(1960, 1964, () => ({ champions: { ENG: 'arsenal', GER: 'bayern' } }));
      expect(featOf(both)).toMatchObject({ kind: 'league-run', club: { id: 'arsenal' } });
    });
  });
});
