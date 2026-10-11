import { describe, expect, it } from 'vitest';
import type { SeasonArchive } from '../../../../packages/contracts/src/types';
import { createWorld } from '../../../../packages/engine/src/index';
import { eloOf, eloRank } from '../../../../packages/engine/src/ratings';
import { ownLeagueIds } from './league';
import { eloDetail, eloStanding, leaguePositionDetail, pyramidPosition } from './recordTrends';

const season = (
  year: number,
  tier: number,
  group: number,
  rank: number,
  points: number,
  fields: Partial<SeasonArchive> = {},
): SeasonArchive => ({
  year,
  tier,
  group,
  rank,
  points,
  played: 38,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  cash: '0',
  currency: 'EUR',
  income: '0',
  expense: '0',
  fans: 1000,
  rating: 40,
  manager: 'Manager',
  metrics: Array<number>(12).fill(0),
  standings: [],
  champions: [],
  europe: [],
  ...fields,
});

describe('league position bubble', () => {
  // Italy: 20 and 20 clubs in the top two divisions, three groups of 20 in the third.
  const seasons = [
    season(1950, 3, 0, 3, 50),
    season(1951, 2, 1, 1, 71),
    season(1952, 1, 0, 18, 40),
    season(1953, 2, 2, 7, 55),
  ];
  it('names the amateur league, regional groups only where they exist and the move that followed', () => {
    expect(leaguePositionDetail('ITA', seasons, 0, 2)).toBe(
      '1950/51 · 아마추어 리그 3위 · 승점 50 · 피라미드 103위 · 승격',
    );
    expect(leaguePositionDetail('ITA', seasons, 1, 2)).toBe(
      '1951/52 · 3부 B조 1위 · 승점 71 · 피라미드 41위 · 우승 · 승격',
    );
    expect(leaguePositionDetail('ITA', seasons, 2, 2)).toBe(
      '1952/53 · 2부 18위 · 승점 40 · 피라미드 38위 · 강등',
    );
  });

  it('compares the last season with the division played now', () => {
    expect(leaguePositionDetail('ITA', seasons, 3, 2)).toBe(
      '1953/54 · 3부 C조 7위 · 승점 55 · 피라미드 47위',
    );
    expect(leaguePositionDetail('ITA', seasons, 3, 1)).toMatch(/ · 승격$/);
    expect(leaguePositionDetail('ITA', seasons, 3, 3)).toMatch(/ · 강등$/);
    expect(leaguePositionDetail('ENG', [season(1987, 1, 0, 3, 71)], 0, 1)).toBe(
      '1987/88 · 2부 3위 · 승점 71 · 피라미드 23위',
    );
  });

  it('counts every club in the divisions above', () => {
    expect(pyramidPosition('ENG', { tier: 0, rank: 1 })).toBe(1);
    expect(pyramidPosition('ENG', { tier: 2, rank: 5 })).toBe(49);
    expect(pyramidPosition('ENG', { tier: 4, rank: 2 })).toBe(94);
  });
});

describe('Elo bubble', () => {
  it('adds the league and world spread, highest first, when the season kept it', () => {
    const rated = season(1987, 0, 0, 3, 71, {
      elo: 1530,
      eloRank: 412,
      eloRange: [1105, 2010, 1380, 1620],
    });
    expect(eloDetail(rated)).toBe(
      '1987/88 · Elo 1530 · 전체 412위 · 리그 1620–1380 · 세계 2010–1105',
    );
    expect(eloDetail({ ...rated, eloRange: undefined })).toBe('1987/88 · Elo 1530 · 전체 412위');
  });
});

describe('Elo standing', () => {
  it('places our Elo among every club and against our league', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Standing',
      color: '#24664f',
      seed: 'elo-standing',
      difficulty: 2,
    });
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    const league = ownLeagueIds(w).filter((id) => id !== own.id);
    const rival = w.clubs.find((c) => c.id === league[0])!,
      weakest = w.clubs.find((c) => c.id === league[1])!,
      giant = w.clubs.find((c) => !league.includes(c.id) && c.id !== own.id)!;
    for (const id of league) w.clubs.find((c) => c.id === id)!.elo = 1100;
    own.elo = 1200.4;
    rival.elo = 1290;
    weakest.elo = 900;
    giant.elo = 2500;
    const standing = eloStanding(w);
    expect(standing.elo).toBe(1200);
    expect(standing.rank).toBe(eloRank(w));
    expect(standing.total).toBe(w.clubs.length);
    expect(standing.world.high).toEqual({ club: giant, elo: 2500 });
    expect(standing.world.low.elo).toBe(Math.round(Math.min(...w.clubs.map(eloOf))));
    expect(standing.league.high).toEqual({ club: rival, elo: 1290 });
    expect(standing.league.low).toEqual({ club: weakest, elo: 900 });
    expect(standing.gap).toBe(-90);
    rival.elo = 1150;
    expect(eloStanding(w).league.high.club).toBe(own);
    expect(eloStanding(w).gap).toBe(0);
  });
});
