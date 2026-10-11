import { describe, expect, it } from 'vitest';
import { canonical, validateWorld, type World } from '../../contracts/src/index';
import { currency, priceIndex } from '../../catalogs/src/index';
import {
  advanceRound,
  closeSeason,
  createWorld,
  cupKey,
  eloOf,
  finishCups,
  finishEurope,
  legsOf,
  ownLeagueClubs,
  prepareSeason,
  tieAggregate,
} from './index';
import { professionalStart } from './testing';

/** A club whose first season is `year`, with a squad and manager of that time. */
function founded(year?: number) {
  const w = createWorld({
    country: 'ENG',
    name: 'Archive Rovers',
    color: '#2a4d3a',
    seed: 'season-archive',
    difficulty: 1,
  });
  if (!year) return w;
  w.year = year;
  w.currency = currency('ENG', year).code;
  w.priceIndex = priceIndex('ENG', year).value;
  w.manager.since = year;
  w.manager.until = year + 3;
  for (const p of w.players) {
    p.born = year - 24;
    p.until = year + 2;
  }
  prepareSeason(w);
  return w;
}

/** Plays a season to its last round and closes it; `live` is the world as the close archived it. */
function closedSeason(w: World) {
  while (w.round < 46) advanceRound(w, undefined, false);
  const live = structuredClone(w);
  finishCups(live);
  finishEurope(live);
  closeSeason(w);
  return { w, live, season: w.history.at(-1)! };
}

describe('closed season archive', () => {
  it.each([
    ['amateur', (w: World) => w],
    ['professional', professionalStart],
  ])('keeps the %s league scorers, the rank after every round and the Elo spread', (_, start) => {
    const { w, live, season } = closedSeason(start(founded()));
    const scorers = season.scorers!;
    const table = live.scorerSeason!.players.filter((p) => p.goals > 0);
    expect(scorers).toHaveLength(Math.min(10, table.length));
    expect(scorers.length).toBeGreaterThan(0);
    scorers.forEach((scorer, i) => {
      expect(scorer.club).toBeGreaterThanOrEqual(0);
      expect(scorer.club).toBeLessThan(w.clubs.length);
      expect(table).toContainEqual(
        expect.objectContaining({ ...scorer, club: w.clubs[scorer.club].id }),
      );
      const next = scorers[i + 1];
      if (next)
        expect(
          scorer.goals > next.goals ||
            (scorer.goals === next.goals && scorer.appearances <= next.appearances),
        ).toBe(true);
    });
    // Nobody left out scored more than the last one kept.
    expect(table.filter((p) => p.goals > scorers.at(-1)!.goals).length).toBeLessThan(
      scorers.length,
    );

    // One rank per settled round, read from the snapshots the live rank graph draws.
    const snapshots = w
      .rankHistory!.filter(
        (s) =>
          s.year === season.year &&
          s.round > 0 &&
          s.tier === season.tier &&
          s.group === season.group,
      )
      .sort((a, b) => a.round - b.round);
    expect(season.ranks).toHaveLength(46);
    expect(season.ranks).toEqual(
      snapshots.map((s) => s.rows.findIndex(([i]) => w.clubs[i].id === w.playerClub) + 1),
    );
    expect(season.ranks!.at(-1)).toBe(season.rank);

    const world = live.clubs.map(eloOf),
      league = ownLeagueClubs(live).map(eloOf);
    expect(season.eloRange).toEqual(
      [Math.min(...world), Math.max(...world), Math.min(...league), Math.max(...league)].map(
        Math.round,
      ),
    );
    const [low, high, leagueLow, leagueHigh] = season.eloRange!;
    expect(low).toBeLessThanOrEqual(leagueLow);
    expect(leagueLow).toBeLessThanOrEqual(season.elo!);
    expect(season.elo!).toBeLessThanOrEqual(leagueHigh);
    expect(leagueHigh).toBeLessThanOrEqual(high);
    // Decoding keeps every archived field.
    expect(canonical(validateWorld(structuredClone(w)))).toBe(canonical(w));
  });

  it('archives the 1980 cup and continental brackets from the last 32 to the final', () => {
    const { w, live, season } = closedSeason(founded(1980));
    const cup = live.cups!.find((c) => c.country === 'ENG')!;
    const sources = new Map([
      ['cup', { id: cupKey('ENG'), rounds: cup.rounds, fixtures: cup.fixtures }],
      ...live.europe.map(
        (t) => [t.key, { id: t.key, rounds: t.rounds!, fixtures: t.fixtures }] as const,
      ),
    ]);
    const brackets = season.brackets!;
    expect(
      Object.fromEntries(brackets.map((b) => [b.key, b.rounds.map((r) => r.ties.length)])),
    ).toEqual({
      cup: [16, 8, 4, 2, 1],
      ucl: [16, 8, 4, 2, 1],
      uel: [16, 8, 4, 2, 1],
      cwc: [16, 8, 4, 2, 1],
    });
    // The Super Cup was played, but it is no bracket.
    expect(season.europe.some((e) => e.kind === 'super')).toBe(true);
    for (const bracket of brackets) {
      const source = sources.get(bracket.key)!;
      const skipped = source.rounds.length - bracket.rounds.length;
      bracket.rounds.forEach((round, r) => {
        const index = skipped + r,
          kept = source.rounds[index];
        expect(round).toMatchObject({ label: kept.label, round: kept.round, legs: kept.legs });
        expect(round.byes).toBeUndefined();
        round.ties.forEach((row, t) => {
          const tie = kept.ties[t];
          // The closed season's fixtures are found by its year once the world has moved on.
          const legs = legsOf(w, source.fixtures, source.id, index, t, season.year);
          expect(legs).toHaveLength(kept.legs);
          expect([w.clubs[row[0]].id, w.clubs[row[1]].id]).toEqual([tie.home, tie.away]);
          expect(row.slice(2, 4)).toEqual([legs[0].score!.home, legs[0].score!.away]);
          expect(row.slice(4, 6)).toEqual(
            legs[1] ? [legs[1].score!.home, legs[1].score!.away] : [0, 0],
          );
          expect([row[2] + row[5], row[3] + row[4]]).toEqual(tieAggregate(tie, legs));
          expect(row[6] % 2).toBe(tie.winner === tie.home ? 0 : 1);
          expect(row[6] >> 1).toBe(tie.decided === 'pens' ? 1 : tie.decided === 'away' ? 2 : 0);
        });
      });
    }
    validateWorld(w);
  });

  it('rejects archived bracket rows and scorers that point nowhere or contradict their legs', () => {
    const { w, season } = closedSeason(founded());
    const corruptions: ((row: number[]) => void)[] = [
      (row) => (row[0] = w.clubs.length),
      (row) => (row[1] = w.clubs.length),
      (row) => (row[1] = row[0]),
      (row) => (row[6] = 6),
      // A single match has no second leg and no away goals.
      (row) => (row[4] = 1),
      (row) => (row[6] = 4),
    ];
    expect(season.brackets![0].rounds[0].legs).toBe(1);
    for (const corrupt of corruptions) {
      const copy = structuredClone(w);
      corrupt(copy.history[0].brackets![0].rounds[0].ties[0]);
      expect(() => validateWorld(copy)).toThrow('대진 기록 참조 손상');
    }
    const bye = structuredClone(w);
    bye.history[0].brackets![0].rounds[0].byes = [w.clubs.length];
    expect(() => validateWorld(bye)).toThrow('대진 기록 참조 손상');
    const short = structuredClone(w);
    short.history[0].brackets![0].rounds[0].ties[0].pop();
    expect(() => validateWorld(short)).toThrow();
    const scorer = structuredClone(w);
    scorer.history[0].scorers![0].club = w.clubs.length;
    expect(() => validateWorld(scorer)).toThrow('시즌 득점 기록 참조 손상');
    const spread = structuredClone(w);
    const [low, high, leagueLow, leagueHigh] = season.eloRange!;
    spread.history[0].eloRange = [leagueLow + 1, high, leagueLow, leagueHigh];
    expect(() => validateWorld(spread)).toThrow();
    expect(low).toBeLessThanOrEqual(leagueLow);
  });

  it('keeps no partial scorer table or rank series from a season tracked midway', () => {
    const w = founded();
    advanceRound(w, undefined, false);
    advanceRound(w, undefined, false);
    // An older save starts both records at the next round.
    delete w.scorerSeason;
    w.rankHistory = w.rankHistory!.filter((s) => s.round > 1);
    const { season } = closedSeason(w);
    expect(season).not.toHaveProperty('scorers');
    expect(season).not.toHaveProperty('ranks');
    expect(season.brackets!.length).toBeGreaterThan(0);
    expect(season.eloRange).toHaveLength(4);
  });
});
