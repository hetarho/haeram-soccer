import { describe, expect, it } from 'vitest';
import { createWorld, advanceRound, groupKey, ranked } from '../../../../packages/engine/src/index';
import { professionalStart } from '../../../../packages/engine/src/testing';
import {
  clubDivision,
  formFor,
  leagueFixtures,
  leagueIds,
  leagueOf,
  leagueParam,
  parseLeague,
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

describe('league choice (WEB-65)', () => {
  it('opens on the own league, amateur one included, and names any other in the address', () => {
    const amateur = createWorld(input);
    expect(leagueIds(amateur)).toEqual(ownLeagueIds(amateur));
    const w = professionalStart(createWorld(input));
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    expect(leagueIds(w, { code: own.country, tier: own.tier, group: own.group })).toEqual(
      ownLeagueIds(w),
    );
    const german = leagueIds(w, { code: 'GER', tier: 0, group: 0 });
    expect(german).toHaveLength(18);
    expect(german.every((id) => w.clubs.find((c) => c.id === id)!.country === 'GER')).toBe(true);
    expect(leagueParam({ code: 'ITA', tier: 2, group: 1 })).toBe('ITA.2.1');
    expect(parseLeague('ITA.2.1')).toEqual({ code: 'ITA', tier: 2, group: 1 });
    expect(parseLeague('ita.2')).toBeUndefined();
    expect(parseLeague(null)).toBeUndefined();
  });
});

describe('league insight facts', () => {
  it('reconstructs each round from settled scores for old saves and matches the engine table', () => {
    const w = professionalStart(createWorld(input));
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
    const w = professionalStart(createWorld(input)),
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
    const w = professionalStart(createWorld(input));
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

  it('sends up as many amateur clubs as the last division relegates, the last by play-off', () => {
    // One League Two group drops two: the champions go up and 2nd–5th play off for the other.
    const eng = createWorld(input);
    expect(leagueRules(eng, ownLeagueIds(eng))).toMatchObject({
      automatic: 1,
      playoff: 4,
      relegation: 0,
      lower: true,
    });
    // Three Serie C groups drop six: the top five go up and 6th–9th play off for the sixth.
    const ita = createWorld({ ...input, country: 'ITA' });
    expect(leagueRules(ita, ownLeagueIds(ita))).toMatchObject({
      automatic: 5,
      playoff: 4,
      relegation: 0,
      lower: true,
    });
  });

  it("finds any club's own league and names where it plays, whoever opens its sheet", () => {
    const w = createWorld(input),
      club = (id: string) => w.clubs.find((c) => c.id === id)!;
    // Our amateur league is the clubs in its fixtures, representatives included.
    const own = ownLeagueIds(w),
      amateur = own.find((id) => id !== w.playerClub)!;
    expect(leagueOf(w, club(w.playerClub))).toEqual(own);
    expect(leagueOf(w, club(amateur))).toEqual(own);
    expect(clubDivision(w, club(amateur))).toBe('아마추어 리그');
    // A professional club abroad plays in its own division, named with its country.
    const german = w.clubs.find((c) => c.country === 'GER' && c.tier === 1 && !c.representative)!;
    const division = leagueOf(w, german);
    expect(division).toContain(german.id);
    expect(division.every((id) => club(id).country === 'GER' && club(id).tier === 1)).toBe(true);
    expect(clubDivision(w, german)).toBe('독일 2부');
    const regional = w.clubs.find((c) => c.country === 'ITA' && c.tier === 2 && c.group === 1)!;
    expect(clubDivision(w, regional)).toBe('이탈리아 3부 B조');
    // Continental representatives and amateurs outside our league play in no league.
    const abroad = club('euro:4');
    expect(leagueOf(w, abroad)).toEqual([]);
    expect(clubDivision(w, abroad)).toBe('해외 클럽 · 그리스');
    const idle = w.clubs.find((c) => c.representative && c.country === 'FRA' && c.tier > 0)!;
    expect(leagueOf(w, idle)).toEqual([]);
    expect(clubDivision(w, idle)).toBe('프랑스 아마추어 리그');
  });
});
