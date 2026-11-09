import { describe, expect, it } from 'vitest';
import {
  CAREER_READS_FORMAT,
  OBSOLETE_CAREER_READS_FORMAT,
  careerReadsSchema,
} from './career-reads';

const summary = () => ({
  format: CAREER_READS_FORMAT,
  year: 1930,
  matches: 0,
  events: 0,
  history: 0,
  wins: 0,
  promoted: false,
  bestPlayed: 0,
  bestFans: 0,
  bestWon: 0,
  heatPlayers: [],
  players: {},
  europe: {},
});

describe('current career-read contract', () => {
  it('accepts only the current summary format', () => {
    const current = summary();
    expect(careerReadsSchema.parse(current)).toEqual(current);
    for (const format of [OBSOLETE_CAREER_READS_FORMAT, 0, 3, '2', null, undefined])
      expect(careerReadsSchema.safeParse({ ...current, format }).success).toBe(false);
  });

  it.each(['matches', 'events', 'history', 'wins', 'bestPlayed', 'bestFans', 'bestWon'])(
    'bounds the %s counter',
    (field) => {
      for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '0'])
        expect(careerReadsSchema.safeParse({ ...summary(), [field]: value }).success).toBe(false);
    },
  );

  it('bounds years, player pairs, heat data and season keys', () => {
    const player = {
      year: 1930,
      apps: [0, 1],
      sub: [0, 0],
      yellow: [0, 1],
      red: [0, 0],
      leagueReds: 0,
    };
    expect(careerReadsSchema.safeParse({ ...summary(), players: { person: player } }).success).toBe(
      true,
    );
    for (const invalid of [
      { year: 1900 },
      { year: 4001 },
      { heatPlayers: [''] },
      { europe: { nope: 1 } },
      { players: { person: { ...player, year: 4001 } } },
      { players: { person: { ...player, yellow: [0, -1] } } },
      { players: { person: { ...player, red: [0] } } },
      { players: { person: { ...player, leagueReds: 0.1 } } },
      { players: { person: { ...player, heat: Array(10001).fill(0) } } },
    ])
      expect(careerReadsSchema.safeParse({ ...summary(), ...invalid }).success).toBe(false);
  });
});
