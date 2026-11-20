import { describe, expect, it } from 'vitest';
import { careerReadsSchema, CAREER_READS_FORMAT } from './career-reads';
import { matchMaterialSchema, seasonArchiveSchema } from './schema';

describe('legacy heat in a saved record', () => {
  it('loads and strips heat while preserving the other facts', () => {
    const material = { shots: [1, 2], network: [3], report: [4] };
    const archive = {
      year: 1950,
      tier: 1,
      group: 0,
      rank: 1,
      points: 3,
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      gf: 2,
      ga: 0,
      cash: '4',
      currency: 'GBP',
      income: '3',
      expense: '1',
      fans: 100,
      rating: 50,
      manager: 'Manager',
      metrics: Array(12).fill(0),
      standings: [],
      champions: [],
      europe: [],
    };
    const player = {
      year: 1950,
      apps: [1, 1],
      sub: [0, 0],
      yellow: [0, 0],
      red: [0, 0],
      leagueReds: 0,
    };
    const career = {
      format: CAREER_READS_FORMAT,
      year: 1950,
      matches: 1,
      events: 0,
      history: 1,
      wins: 1,
      promoted: false,
      bestPlayed: 1,
      bestFans: 100,
      bestWon: 1,
      players: { p: player },
      europe: {},
    };
    const saved = JSON.parse(
      JSON.stringify({
        material: { ...material, heat: [9, 8] },
        archive: { ...archive, heat: { p: [7] } },
        career: { ...career, heatPlayers: ['p'], players: { p: { ...player, heat: [6] } } },
      }),
    );
    expect(matchMaterialSchema.parse(saved.material)).toEqual(material);
    expect(seasonArchiveSchema.parse(saved.archive)).toEqual(archive);
    const snapshot = { ownClub: 'own', champions: { rival: 72 } };
    expect(
      seasonArchiveSchema.parse({ ...archive, closingClubOvr: snapshot }).closingClubOvr,
    ).toEqual(snapshot);
    expect(
      seasonArchiveSchema.safeParse({ ...archive, closingClubOvr: { champions: { rival: 72.5 } } })
        .success,
    ).toBe(false);
    expect(
      seasonArchiveSchema.safeParse({ ...archive, closingClubOvr: { champions: { '': 72 } } })
        .success,
    ).toBe(false);
    const full = { ownClub: 'own', clubs: { rival: 72, other: 63 } };
    expect(seasonArchiveSchema.parse({ ...archive, closingClubOvr: full }).closingClubOvr).toEqual(
      full,
    );
    expect(
      seasonArchiveSchema.safeParse({ ...archive, closingClubOvr: { clubs: { rival: 72.5 } } })
        .success,
    ).toBe(false);
    expect(
      seasonArchiveSchema.safeParse({ ...archive, closingClubOvr: { clubs: { '': 72 } } }).success,
    ).toBe(false);
    expect(seasonArchiveSchema.parse(archive).closingClubOvr).toBeUndefined();
    expect(careerReadsSchema.parse(saved.career)).toEqual(career);
  });
});
