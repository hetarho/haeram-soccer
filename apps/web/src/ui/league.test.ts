import { describe, expect, it } from 'vitest';
import { createWorld, advanceRound, groupKey, ranked } from '../../../../packages/engine/src/index';
import {
  formFor,
  leagueFixtures,
  leagueRules,
  leagueTimeline,
  orderIds,
  ownLeagueIds,
} from './league';

const input = {
  country: 'ENG' as const,
  name: 'Haeram League',
  color: '#24664f',
  seed: 'league-insights',
  difficulty: 1,
};

describe('league insight facts', () => {
  it('reconstructs each round from settled scores for old saves and matches the engine table', () => {
    const w = createWorld(input);
    for (let i = 0; i < 4; i++) advanceRound(w);
    delete w.rankHistory;
    const ids = ownLeagueIds(w),
      timeline = leagueTimeline(w, ids);
    expect(timeline).toHaveLength(4);
    expect(timeline.at(-1)!.rows.map((row) => row.id)).toEqual(orderIds(ids, w.tables));
    for (const row of timeline.at(-1)!.rows) expect(row.points).toBe(w.tables[row.id].points);
    expect(timeline[0].rows.every((row) => row.points <= 3)).toBe(true);
  });

  it('uses the same tiebreaks as engine ranking and never mixes another league into form', () => {
    const w = createWorld(input),
      ids = ownLeagueIds(w);
    ids.forEach((id, i) => {
      w.tables[id] = {
        played: 3,
        won: 1,
        drawn: 1,
        lost: 1,
        gf: (i % 3) + 2,
        ga: (i % 2) + 1,
        points: (i % 4) + 1,
      };
    });
    expect(orderIds(ids, w.tables)).toEqual(
      ranked(
        w,
        w.clubs.filter((c) => ids.includes(c.id)),
      ).map((c) => c.id),
    );
    const fixtures = leagueFixtures(w, ids);
    expect(
      fixtures.every((f) => f.groupKey === groupKey(w.clubs.find((c) => c.id === w.playerClub)!)),
    ).toBe(true);
    const owned = fixtures
      .filter((f) => f.home === w.playerClub || f.away === w.playerClub)
      .slice(0, 6);
    owned.forEach((f, i) => {
      f.score = f.home === w.playerClub ? { home: i % 3, away: 1 } : { home: 1, away: i % 3 };
    });
    expect(formFor(owned, w.playerClub)).toEqual(['무', '승', '패', '무', '승']);
  });

  it('retains earlier rounds when a legacy save starts recording snapshots midseason', () => {
    const w = createWorld(input);
    for (let i = 0; i < 4; i++) advanceRound(w);
    const ids = ownLeagueIds(w);
    w.rankHistory = [
      {
        year: w.year,
        round: w.round,
        day: 28,
        tier: 3,
        group: 0,
        rows: orderIds(ids, w.tables).map((id) => [
          w.clubs.findIndex((club) => club.id === id),
          w.tables[id].points,
          w.tables[id].gf,
          w.tables[id].ga,
        ]),
      },
    ];
    expect(leagueTimeline(w, ids).map((round) => round.round)).toEqual([1, 2, 3, 4]);
  });

  it('shows one direct promotion place in regional leagues and none at the top', () => {
    const w = createWorld({ ...input, country: 'ITA' });
    const regional = w.clubs
      .filter((c) => c.country === 'ITA' && c.tier === 2 && c.group === 0 && !c.representative)
      .map((c) => c.id);
    expect(leagueRules(w, regional)).toMatchObject({ automatic: 1, playoff: 3, relegation: 2 });
    const top = w.clubs
      .filter((c) => c.country === 'ITA' && c.tier === 0 && !c.representative)
      .map((c) => c.id);
    expect(leagueRules(w, top)).toMatchObject({ automatic: 0, playoff: 0, relegation: 3 });
  });
});
