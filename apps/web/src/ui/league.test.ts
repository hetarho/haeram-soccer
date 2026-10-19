import { describe, expect, it } from 'vitest';
import type { StandingSnapshot, TableRow, World } from '../../../../packages/contracts/src/types';
import { createWorld, advanceRound, groupKey, ranked } from '../../../../packages/engine/src/index';
import { professionalStart } from '../../../../packages/engine/src/testing';
import {
  archivedTimeline,
  clubDivision,
  formFor,
  leagueFixtures,
  leagueIds,
  leagueOf,
  leagueOverviewModel,
  leagueParam,
  parseLeague,
  leagueRules,
  leagueTimeline,
  orderIds,
  ownLeagueIds,
  rankHistoryYears,
  RESULT_POINTS,
} from './league';

const input = {
  country: 'ENG' as const,
  name: 'Haeram League',
  color: '#24664f',
  seed: 'league-insights',
  level: 'normal' as const,
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

/** A hand-made table row: only the order's keys matter. */
const row = (points: number, gf: number, ga: number): TableRow => ({
  played: 3,
  won: 0,
  drawn: 0,
  lost: 0,
  gf,
  ga,
  points,
});

describe('league table order (live, closed and continental tables)', () => {
  it('orderIds ranks by points, goal difference, goals for, then ID', () => {
    const tables = {
      fewer: row(4, 9, 0),
      level: row(6, 2, 2),
      most: row(6, 5, 2),
      fewerGoals: row(6, 4, 1),
      laterId: row(6, 4, 1),
    };
    const ids = ['laterId', 'fewer', 'fewerGoals', 'level', 'most'];
    expect(orderIds(ids, tables)).toEqual(['most', 'fewerGoals', 'laterId', 'level', 'fewer']);
    expect(ids[0]).toBe('laterId');
  });

  it('orderIds treats a missing row as empty', () => {
    const tables = { behind: row(0, 0, 1), ahead: row(1, 1, 1) };
    expect(orderIds(['behind', 'missing', 'ahead'], tables)).toEqual([
      'ahead',
      'missing',
      'behind',
    ]);
  });
});

/** A kept round of `year` listing `ids` in rank order, each a point below the one above. */
function snapshot(w: World, year: number, round: number, ids: string[]): StandingSnapshot {
  return {
    year,
    round,
    day: round * 7,
    tier: 3,
    group: 0,
    rows: ids.map((id, i): [number, number, number, number] => [
      w.clubs.findIndex((club) => club.id === id),
      ids.length - i,
      10 + round,
      i,
    ]),
  };
}

describe('rank history models', () => {
  it('archivedTimeline maps a stored snapshot to ranked rows', () => {
    const w = professionalStart(createWorld(input)),
      ids = ownLeagueIds(w),
      reversed = [...ids].reverse();
    w.rankHistory = [
      snapshot(w, w.year, 2, reversed),
      snapshot(w, w.year, 1, ids),
      snapshot(w, w.year, 0, ids),
      snapshot(w, w.year - 1, 3, ids),
    ];
    const timeline = archivedTimeline(w, w.year);
    // Played rounds of that season only, in round order.
    expect(timeline.map((round) => round.round)).toEqual([1, 2]);
    expect(timeline[1]).toMatchObject({ year: w.year, round: 2, tier: 3, group: 0 });
    expect(timeline[1].rows.map((row) => row.id)).toEqual(reversed);
    expect(timeline[1].rows[0]).toEqual({
      id: reversed[0],
      rank: 1,
      points: ids.length,
      gf: 12,
      ga: 0,
    });
    expect(timeline[1].rows.at(-1)!.rank).toBe(ids.length);
    // Another league's table, without our club, is no record of ours.
    const german = leagueIds(w, { code: 'GER', tier: 0, group: 0 });
    w.rankHistory.push(snapshot(w, w.year, 3, german));
    expect(archivedTimeline(w, w.year).map((round) => round.round)).toEqual([1, 2]);
  });

  it('rankHistoryYears lists the current year then earlier own-league years, newest first', () => {
    const w = professionalStart(createWorld(input)),
      ids = ownLeagueIds(w);
    w.rankHistory = [
      snapshot(w, w.year - 3, 5, ids),
      snapshot(w, w.year - 1, 1, ids),
      snapshot(w, w.year - 1, 2, ids),
      snapshot(w, w.year - 2, 0, ids),
      snapshot(w, w.year - 4, 1, leagueIds(w, { code: 'GER', tier: 0, group: 0 })),
    ];
    expect(rankHistoryYears(w, ids)).toEqual([w.year, w.year - 1, w.year - 3]);
    // Another league shows only the season in progress.
    expect(rankHistoryYears(w, leagueIds(w, { code: 'GER', tier: 0, group: 0 }))).toEqual([w.year]);
  });
});

describe('league overview model', () => {
  /** Our league with our club placed `place` (0-based), every club two points below the last. */
  function placed(place: number) {
    const w = professionalStart(createWorld(input)),
      others = ownLeagueIds(w).filter((id) => id !== w.playerClub),
      order = [...others.slice(0, place), w.playerClub, ...others.slice(place)];
    order.forEach((id, i) => {
      w.tables[id] = { ...row(100 - 2 * i, 10, 10), played: 10 };
    });
    return { w, order, rules: leagueRules(w, order)! };
  }

  it('leagueOverviewModel reports the gap to the automatic-promotion line and the cushion above relegation', () => {
    const outside = placed(5),
      { automatic, relegation } = outside.rules;
    expect(automatic).toBeGreaterThan(0);
    expect(automatic).toBeLessThan(5);
    const model = leagueOverviewModel(outside.w),
      points = (w: World, id: string) => w.tables[id].points;
    expect(model.rank).toBe(6);
    expect(model.threshold).toBe(automatic);
    expect(model.inside).toBe(false);
    // Outside the line: up to the last automatic place.
    expect(model.gap).toBe(
      points(outside.w, outside.order[automatic - 1]) - points(outside.w, outside.w.playerClub),
    );
    expect(model.cushion).toBe(
      points(outside.w, outside.w.playerClub) -
        points(outside.w, outside.order[outside.order.length - relegation]),
    );
    expect(model.cushion).toBeGreaterThan(0);
    // Inside the line: ahead of the first club below it.
    const top = placed(0),
      leading = leagueOverviewModel(top.w);
    expect(leading.inside).toBe(true);
    expect(leading.gap).toBe(
      points(top.w, top.w.playerClub) - points(top.w, top.order[top.rules.automatic]),
    );
  });

  /** Plays our first league matches with these (own, opponent) scores, in round order. */
  function played(scores: [number, number][]) {
    const w = professionalStart(createWorld(input)),
      ours = leagueFixtures(w, ownLeagueIds(w))
        .filter((f) => f.home === w.playerClub || f.away === w.playerClub)
        .sort((a, b) => a.round - b.round);
    scores.forEach(([own, other], i) => {
      const f = ours[i];
      f.score = f.home === w.playerClub ? { home: own, away: other } : { home: other, away: own };
    });
    return w;
  }

  it('leagueOverviewModel counts the current streak', () => {
    const drawing = leagueOverviewModel(
      played([
        [2, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [0, 0],
        [2, 2],
      ]),
    );
    expect(drawing.form).toEqual(['승', '패', '무', '무', '무']);
    expect(drawing.streak).toEqual({ result: '무', length: 3 });
    // A run as long as the form counts every match of it.
    const winning = leagueOverviewModel(played(Array.from({ length: 6 }, () => [1, 0])));
    expect(winning.streak).toEqual({ result: '승', length: 5 });
    expect(leagueOverviewModel(played([])).streak.length).toBe(0);
  });

  it("leagueOverviewModel gives the last match's points", () => {
    const won = leagueOverviewModel(
      played([
        [0, 1],
        [3, 2],
      ]),
    );
    expect(won.lastMatch?.round).toBeGreaterThan(0);
    expect([won.ownGoals, won.opponentGoals]).toEqual([3, 2]);
    expect(won.matchPoints).toBe(RESULT_POINTS.win);
    expect(
      leagueOverviewModel(
        played([
          [3, 0],
          [1, 1],
        ]),
      ).matchPoints,
    ).toBe(RESULT_POINTS.draw);
    expect(leagueOverviewModel(played([[0, 2]])).matchPoints).toBe(RESULT_POINTS.loss);
    const none = leagueOverviewModel(played([]));
    expect(none.lastMatch).toBeUndefined();
    expect(none.matchPoints).toBe(0);
  });
});
