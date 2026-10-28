import { describe, expect, it } from 'vitest';
import type { Club, EuropeTournament, Fixture, World } from '../../contracts/src/types';
import { associationCoefficients, coefficientValue, leaguePhaseBonus } from './europe-coefficients';

const clubs: Club[] = ['ENG', 'ESP', 'ENG', 'FRA'].map((country, i) => ({
  id: `c${i}`,
  country,
  name: `Club ${i}`,
  short: `${i}`,
  tier: 0,
  group: 0,
  strength: 70,
  reputation: 40,
  fans: 1000,
  color: '#112233',
}));
function fixture(id: string, home: string, away: string, a: number, b: number): Fixture {
  return {
    id,
    year: 2034,
    round: 43,
    kind: 'europe',
    country: 'UEFA',
    groupKey: 'ucl',
    home,
    away,
    score: { home: a, away: b },
  };
}
function tournament(key = 'ucl'): EuropeTournament {
  return {
    key,
    name: key,
    field: 4,
    format: 'knockout',
    games: 0,
    stage: '결승',
    clubs: ['c0', 'c1', 'c2'],
    fixtures: [fixture(`${key}:k0:0`, 'c0', 'c1', 2, 0), fixture(`${key}:k0:1`, 'c2', 'c1', 1, 1)],
    standings: {},
    rounds: [],
    winner: 'c0',
  };
}
const world = (t = tournament(), year = 2034): Pick<World, 'year' | 'clubs' | 'europe'> => ({
  year,
  clubs,
  europe: [t],
});

describe('association coefficients from completed Europe', () => {
  it('counts 2/1/0 match points and divides by distinct entrants in exact eighths', () => {
    const rows = associationCoefficients(world())!;
    expect(rows).toEqual([
      { country: 'ENG', points: 24, clubs: 2 },
      { country: 'ESP', points: 8, clubs: 1 },
    ]);
    expect(coefficientValue(rows[0])).toBe(1500);
    expect(coefficientValue({ country: 'ENG', points: 8, clubs: 3 })).toBe(333);
    expect(coefficientValue(undefined)).toBe(0);
    expect(coefficientValue({ country: 'ENG', points: 0, clubs: 0 })).toBe(0);
  });

  it('ignores shoot-out kicks, halves qualifier points and excludes the Super Cup', () => {
    const t = tournament();
    t.fixtures = [
      { ...fixture('2034:ucl:k0:0', 'c0', 'c1', 0, 0), shootout: { home: 5, away: 4 } },
    ];
    t.clubs = ['c0', 'c1'];
    t.rounds = [
      {
        label: '예선 1',
        round: 7,
        legs: 1,
        ties: [{ home: 'c0', away: 'c1', winner: 'c0', decided: 'pens' }],
      },
    ];
    const w = world(t);
    w.europe.push(tournament('super'));
    expect(associationCoefficients(w)).toEqual([
      { country: 'ENG', points: 4, clubs: 1 },
      { country: 'ESP', points: 4, clubs: 1 },
    ]);
  });

  it.each([
    ['ucl', 1, 12],
    ['ucl', 24, 6.25],
    ['ucl', 25, 6],
    ['ucl', 36, 6],
    ['uel', 1, 6],
    ['uel', 24, 0.25],
    ['uel', 25, 0],
    ['uecl', 1, 4],
    ['uecl', 8, 2.25],
    ['uecl', 9, 2],
    ['uecl', 24, 0.125],
    ['uecl', 25, 0],
  ])('uses the Annex D.5 %s rank %i phase bonus', (key, rank, expected) => {
    expect(leaguePhaseBonus(key as string, rank as number)).toBe(expected);
  });

  it.each([
    ['ucl', 1.5],
    ['uel', 1],
    ['uecl', 0.5],
  ])('awards %s knockout-stage bonuses once, including direct byes', (key, bonus) => {
    const t = tournament(key as string);
    t.rounds = [
      { label: '16강', round: 31, legs: 2, ties: [{ home: 'c0', away: 'c1' }], byes: ['c2'] },
    ];
    expect(associationCoefficients(world(t))!.find((r) => r.country === 'ENG')!.points).toBe(
      24 + 2 * Number(bonus) * 8,
    );
  });

  it('uses frozen first-phase positions rather than a later table ordering', () => {
    const t = tournament('uecl');
    t.format = 'league';
    t.firstStandings = [
      [0, 24, 6, 1, 2, 3],
      [1, 25, 6, 0, 2, 3],
      [2, 1, 6, 18, 20, 0],
    ];
    expect(associationCoefficients(world(t))!.find((r) => r.country === 'ENG')!.points).toBe(
      24 + 1 + 32,
    );
  });

  it('scores the 2023 group-era UCL entry and round-of-16 bonuses', () => {
    const t = tournament();
    t.format = 'groups';
    t.rounds = [{ label: '16강', round: 29, legs: 2, ties: [{ home: 'c0', away: 'c1' }] }];
    expect(associationCoefficients(world(t, 2023))).toEqual([
      { country: 'ENG', points: 24 + 64 + 40, clubs: 2 },
      { country: 'ESP', points: 8 + 32 + 40, clubs: 1 },
    ]);
  });

  it('awards 2023 UEL and Conference group-winner/runner-up bonuses without club minima', () => {
    const t = tournament('uel');
    t.format = 'groups';
    t.clubs = ['c0', 'c1', 'c2', 'c3'];
    t.standings = Object.fromEntries(
      t.clubs.map((id, i) => [
        id,
        { played: 6, won: 0, drawn: 0, lost: 0, points: 9 - i, gf: 3, ga: 1 },
      ]),
    );
    expect(associationCoefficients(world(t, 2023))!.find((r) => r.country === 'ENG')!.points).toBe(
      24 + 32,
    );
    t.key = 'uecl';
    expect(associationCoefficients(world(t, 2023))!.find((r) => r.country === 'ENG')!.points).toBe(
      24 + 16,
    );
  });

  it('counts the same entrant only once across competitions and rejects incomplete seasons', () => {
    const w = world();
    w.europe.push(tournament('uel'));
    expect(associationCoefficients(w)!.find((r) => r.country === 'ENG')).toMatchObject({
      clubs: 2,
      points: 48,
    });
    w.europe[0].fixtures[0].score = undefined;
    expect(associationCoefficients(w)).toBeUndefined();
    expect(associationCoefficients(world(tournament(), 2022))).toBeUndefined();
    expect(associationCoefficients({ year: 2034, clubs, europe: [] })).toBeUndefined();
  });
});
