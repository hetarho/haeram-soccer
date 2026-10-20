import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { MatchPlayback } from '../../contracts/src/types';
import { nextOwnFixture } from './calendar';
import { eloOf, ownLeagueClubs } from './index';
import { appearanceForFixture } from './match-appearance';
import { advanceRound } from './season';
import { archiveLastRound, closedSeason } from './season.testkit';

describe('closed season archive', () => {
  it.each(['amateur', 'professional'] as const)(
    'keeps the %s league scorers, the rank after every round and the Elo spread',
    (start) => {
      const { w, live, season } = closedSeason(archiveLastRound(start));
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
    },
  );

  it('rejects archived bracket rows and scorers that point nowhere or contradict their legs', () => {
    const { w, season } = closedSeason(archiveLastRound('amateur'));
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
});

describe('league settlement appearance (→KIT-12)', () => {
  it('captures the own league result, observed or not, and nothing for other matches', () => {
    const base = simulatedWorld({
      country: 'ENG',
      name: 'Design Town',
      color: '#223344',
      seed: 'identity-command',
      level: 'normal',
    });
    const next = nextOwnFixture(base)!;
    const expected = appearanceForFixture(base, next);
    for (const observe of [true, false]) {
      const w = structuredClone(base);
      let live: MatchPlayback | undefined;
      advanceRound(w, (_, p) => (live = p), observe);
      expect(live!.record.id).toBe(next.id);
      expect(live!.frames.length > 0).toBe(observe);
      expect(live!.record.appearance).toEqual(expected);
      expect(w.ownMatches.find((m) => m.id === next.id)!.appearance).toEqual(expected);
      // The round's other matches leave no appearance anywhere in the world.
      expect(canonical(w).split('"appearance":').length - 1).toBe(w.ownMatches.length);
    }
  });
});
