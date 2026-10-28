import { describe, expect, it } from 'vitest';
import type { Club, SeasonArchive, World } from '../../contracts/src/types';
import { associationAccessOrder, europeanAccess, performanceAssociations } from './europe-access';

const countries = ['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'NED', 'POR', 'BEL'];
const club = (country: string, rank: number): Club => ({
  id: `${country}:${rank}`,
  country,
  name: `${country} ${rank}`,
  short: `${rank}`,
  tier: 0,
  group: 0,
  strength: 90 - rank,
  reputation: 50,
  fans: 1000,
  color: '#112233',
});
function archive(year: number, clubs: Club[]): SeasonArchive {
  return {
    year,
    tier: 0,
    group: 0,
    rank: 5,
    points: 60,
    played: 38,
    won: 18,
    drawn: 6,
    lost: 14,
    gf: 60,
    ga: 40,
    cash: '0',
    currency: 'GBP',
    income: '0',
    expense: '0',
    fans: 1000,
    rating: 60,
    manager: 'Synthetic',
    metrics: Array(12).fill(0),
    standings: clubs.map((c, index) => [index, c.tier, 0, c.strength, c.strength, 10]),
    champions: countries.map((country) => ({ country, club: `${country}:1`, cup: `${country}:1` })),
    europe: [],
  };
}
function world(year = 2034): Pick<World, 'year' | 'clubs' | 'history' | 'lastChampions'> {
  const clubs = countries.flatMap((c) => Array.from({ length: 12 }, (_, i) => club(c, i + 1)));
  const last = archive(year - 1, clubs);
  return { year, clubs, history: [last], lastChampions: last.champions };
}
function coefficients(h: SeasonArchive, values: Record<string, number> = {}) {
  h.europeCoefficients = countries.map((country) => ({
    country,
    points: (values[country] ?? 1) * 8,
    clubs: 1,
  }));
}
const get = (w: ReturnType<typeof world>, rank: number, country = 'ENG') =>
  europeanAccess(w).get(`${country}:${rank}`)?.competition;
function title(w: ReturnType<typeof world>, kind: string, rank: number) {
  w.history
    .at(-1)!
    .europe.push({ kind, name: kind.toUpperCase(), winner: `ENG:${rank}`, field: 36 });
}

describe('European access from closed facts', () => {
  it('sends English fifth to UEL and passes the overlapping FA Cup berth to sixth', () => {
    const w = world();
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((r) => get(w, r))).toEqual([
      'ucl',
      'ucl',
      'ucl',
      'ucl',
      'uel',
      'uel',
      'uecl',
      undefined,
    ]);
    expect(europeanAccess(w).get('ENG:5')?.reason).toContain('2033/34시즌 리그 5위');
    expect(europeanAccess(w).get('ENG:5')?.reason).toContain('국가 순위 1위 배분');
    expect(performanceAssociations(w)).toEqual([]);
  });

  it('gives a lower-division cup winner its UEL place without substituting the runner-up', () => {
    const w = world();
    w.clubs.push({ ...club('ENG', 13), tier: 1 });
    w.history[0].champions[0].cup = 'ENG:13';
    expect(get(w, 13)).toBe('uel');
    expect(get(w, 5)).toBe('uel');
    expect(get(w, 6)).toBe('uecl');
    expect(get(w, 7)).toBeUndefined();
  });

  it('deduplicates a cup winner already holding the league UEL berth', () => {
    const w = world();
    w.history[0].champions[0].cup = 'ENG:5';
    expect(get(w, 5)).toBe('uel');
    expect(get(w, 6)).toBe('uel');
    expect(get(w, 7)).toBe('uecl');
  });

  it('uses modern quota bands for all eight countries and the earlier group era', () => {
    const w = world();
    const access = europeanAccess(w);
    const counts = countries.map((country) =>
      ['ucl', 'uel', 'uecl'].map(
        (key) =>
          [...access].filter(([id, e]) => id.startsWith(country + ':') && e.competition === key)
            .length,
      ),
    );
    expect(counts).toEqual([
      [4, 2, 1],
      [4, 2, 1],
      [4, 2, 1],
      [4, 2, 1],
      [4, 2, 1],
      [3, 2, 1],
      [2, 1, 2],
      [2, 1, 2],
    ]);
    const old = world(2023);
    expect(get(old, 3, 'POR')).toBe('ucl');
    expect(get(old, 3, 'FRA')).toBe('ucl');
    expect(get(old, 3, 'NED')).toBe('uel');
  });

  it('upgrades fifth via EPS and cascades its domestic berth to one extra entrant', () => {
    const w = world();
    coefficients(w.history[0], { ENG: 20, ESP: 19 });
    expect(performanceAssociations(w)).toEqual(['ENG', 'ESP']);
    expect([4, 5, 6, 7, 8, 9].map((r) => get(w, r))).toEqual([
      'ucl',
      'ucl',
      'uel',
      'uel',
      'uecl',
      undefined,
    ]);
    expect(europeanAccess(w).get('ENG:5')?.reason).toContain('EPS');
    expect(europeanAccess(w).get('ENG:8')?.reason).toContain('승계');
  });

  it('assigns EPS after a fifth-placed UEL titleholder, without refilling its relinquished UEL place', () => {
    const w = world();
    coefficients(w.history[0], { ENG: 20, ESP: 19 });
    title(w, 'uel', 5);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => get(w, r))).toEqual([
      'ucl',
      'ucl',
      'ucl',
      'ucl',
      'ucl',
      'ucl',
      'uel',
      'uecl',
      undefined,
    ]);
    expect(europeanAccess(w).get('ENG:6')?.reason).toContain('EPS');
  });

  it.each(['ucl', 'uel'])('admits an otherwise unqualified %s titleholder to UCL', (key) => {
    const w = world();
    title(w, key, 12);
    expect(get(w, 12)).toBe('ucl');
    expect(get(w, 5)).toBe('uel');
    expect([...europeanAccess(w)].filter(([id]) => id.startsWith('ENG:'))).toHaveLength(8);
  });

  it('retains an earlier UEL winner in UEL and introduces its UCL right in 2015', () => {
    const old = world(2014);
    title(old, 'uel', 12);
    expect(get(old, 12)).toBe('uel');
    const modern = world(2015);
    title(modern, 'uel', 12);
    expect(get(modern, 12)).toBe('ucl');
  });

  it('upgrades a Conference winner from 2022 and respects a higher league qualification', () => {
    const w = world(2022);
    title(w, 'uecl', 12);
    expect(get(w, 12)).toBe('uel');
    const higher = world();
    title(higher, 'uecl', 2);
    expect(get(higher, 2)).toBe('ucl');
    expect([...europeanAccess(higher)].filter(([id]) => id.startsWith('ENG:'))).toHaveLength(7);
    const first = world(2021);
    title(first, 'uecl', 12);
    expect(get(first, 12)).toBeUndefined();
  });

  it('does not pass a European titleholder vacancy to another domestic club', () => {
    const w = world();
    title(w, 'uecl', 7);
    expect(get(w, 7)).toBe('uel');
    expect(get(w, 8)).toBeUndefined();
    title(w, 'uel', 5);
    expect(get(w, 5)).toBe('ucl');
    expect(get(w, 8)).toBeUndefined();
  });

  it('does not create an extra domestic berth when the UCL holder already qualifies', () => {
    const w = world();
    title(w, 'ucl', 1);
    expect([...europeanAccess(w)].filter(([id]) => id.startsWith('ENG:'))).toHaveLength(7);
    expect(get(w, 8)).toBeUndefined();
  });

  it('cascades an EPS UEL vacancy even when a titleholder has consumed the Conference place', () => {
    const w = world();
    title(w, 'ucl', 7);
    coefficients(w.history[0], { ENG: 20, ESP: 19 });
    expect([5, 6, 7, 8, 9].map((r) => get(w, r))).toEqual(['ucl', 'uel', 'ucl', 'uel', undefined]);
  });

  it('respects the first UCL defending champion and the CWC discontinuation', () => {
    const first = world(1955);
    title(first, 'ucl', 12);
    expect(get(first, 12)).toBeUndefined();
    first.year = 1956;
    first.history[0].year = 1955;
    expect(get(first, 12)).toBe('ucl');
    const cwc = world(1998);
    title(cwc, 'cwc', 12);
    expect(get(cwc, 12)).toBe('cwc');
    cwc.year = 1999;
    cwc.history[0].year = 1998;
    expect(get(cwc, 12)).toBeUndefined();
  });

  it('preserves normalized pre-2021 access, founding invitations and competition founding years', () => {
    expect(get(world(2020), 2)).toBe('ucl');
    expect(get(world(2020), 3)).toBe('uel');
    expect(get(world(2020), 5)).toBeUndefined();
    const first = world(1955);
    first.history = [];
    first.lastChampions = [];
    expect(get(first, 1)).toBe('ucl');
    expect(europeanAccess(first).get('ENG:1')?.reason).toContain('초청');
    first.year = 1954;
    expect(europeanAccess(first).size).toBe(0);
  });

  it('ignores nonadjacent archive titles, incomplete coefficients and input array order', () => {
    const w = world();
    title(w, 'uel', 12);
    w.history[0].year -= 1;
    expect(get(w, 12)).toBeUndefined();
    coefficients(w.history[0], { ENG: 50 });
    expect(performanceAssociations(w)).toEqual([]);
    w.history[0].year += 1;
    w.history[0].europeCoefficients!.pop();
    expect(performanceAssociations(w)).toEqual([]);
    const before = JSON.stringify(w);
    europeanAccess(w);
    expect(JSON.stringify(w)).toBe(before);
  });

  it('uses five full seasons ending Y-2 and recent-season tie breaks for association quotas', () => {
    const w = world(2034);
    w.history = Array.from({ length: 6 }, (_, i) => archive(2028 + i, w.clubs));
    for (const h of w.history)
      coefficients(h, { BEL: 40, ENG: 35, ESP: 30, ITA: 25, GER: 20, FRA: 15, POR: 10, NED: 5 });
    // Y-1 is not published in time to change the base access list.
    coefficients(w.history.at(-1)!, { NED: 1000, ENG: 999 });
    expect(associationAccessOrder(w)).toEqual([
      'BEL',
      'ENG',
      'ESP',
      'ITA',
      'GER',
      'FRA',
      'POR',
      'NED',
    ]);
    expect(get(w, 4, 'BEL')).toBe('ucl');
    expect(get(w, 3, 'NED')).toBe('ucl'); // Its current EPS is independent of the lagged base quota.
    expect(get(w, 4, 'NED')).toBe('uel');
    w.history[0].europeCoefficients = undefined;
    expect(associationAccessOrder(w)[0]).toBe('ENG');
  });

  it('breaks equal EPS scores by the five-year order and then a stable baseline', () => {
    const w = world();
    coefficients(w.history[0]);
    expect(performanceAssociations(w)).toEqual(['ENG', 'ESP']);
    w.history = Array.from({ length: 6 }, (_, i) => archive(2028 + i, w.clubs));
    for (const h of w.history) coefficients(h);
    coefficients(w.history[0], { BEL: 4, ENG: 2 });
    coefficients(w.history[4], { ENG: 4, BEL: 2 });
    // Equal sums: the most recent published season wins.
    expect(associationAccessOrder(w).slice(0, 2)).toEqual(['ENG', 'BEL']);
    expect(performanceAssociations(w)).toEqual(['ENG', 'BEL']);
  });
});
