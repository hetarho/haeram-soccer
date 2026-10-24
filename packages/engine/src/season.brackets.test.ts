import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import { advanceRound, cupKey, legsOf, tieAggregate } from './index';
import { cachedWorld, DISABLED_RELEASE } from '../../../tests/fixtures/worlds';
import { archiveLastRound, closedSeason, founded, toLastRound } from './season.testkit';

describe('closed season archive', () => {
  it('archives the 1980 cup and continental brackets from the last 32 to the final', () => {
    const { w, live, season } = closedSeason(archiveLastRound(1980));
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

  it('keeps no partial scorer table or rank series from a season tracked midway', () => {
    const w = cachedWorld('tracked-midway-last-round', () => {
      // The archive's records, not the match model, are the subject.
      const w = founded(undefined, DISABLED_RELEASE);
      advanceRound(w, undefined, false);
      advanceRound(w, undefined, false);
      // An older save starts both records at the next round.
      delete w.scorerSeason;
      w.rankHistory = w.rankHistory!.filter((s) => s.round > 1);
      return toLastRound(w);
    });
    const { season } = closedSeason(w);
    expect(season).not.toHaveProperty('scorers');
    expect(season).not.toHaveProperty('ranks');
    expect(season.brackets!.length).toBeGreaterThan(0);
    expect(season.eloRange).toHaveLength(4);
  });
});
