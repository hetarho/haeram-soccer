import { describe, expect, it } from 'vitest';
import type { Fixture, KnockoutRound } from '../../contracts/src/types';
import { decideTie, tieFixtures, tieRule } from './knockout';
import { fixtureLeg, legsOf } from './competition-keys';
import { releasedResultsWorld } from './results-only.testkit';
import { resultsOnlyMatch } from './results-only';
import { simulateAggregate } from './aggregate/engine';
import { M } from './match/record';

function fixture(legs: 1 | 2 = 2) {
  const w = releasedResultsWorld();
  const round: KnockoutRound = {
    label: 'Quarter-final',
    round: 5,
    legs,
    ties: Array.from({ length: 3 }, (_, i) => ({
      home: w.clubs[i * 2]!.id,
      away: w.clubs[i * 2 + 1]!.id,
    })),
  };
  const fixtures = tieFixtures(w, 'cwc', 'europe', 'UEFA', 2, round);
  return { w, round, fixtures };
}

describe('explicit knockout leg identity (→MATCH-22/6)', () => {
  it.each([false, true])(
    'recognises tie index 2 and the prior legitimate legs (legacy=%s)',
    (legacy) => {
      const { w, round, fixtures } = fixture();
      if (legacy) for (const f of fixtures) delete f.leg;
      for (let index = 0; index < 3; index++) {
        const [first, second] = legsOf(w, fixtures, 'cwc', 2, index);
        expect(fixtureLeg(first!, fixtures)).toBe(1);
        expect(fixtureLeg(second!, fixtures)).toBe(2);
        expect(tieRule(first!, fixtures, true)).toBeUndefined();
        first!.score = { home: 2, away: 1 };
        expect(tieRule(second!, fixtures, true)).toEqual({
          first: { home: 1, away: 2 },
          awayGoals: true,
        });
        second!.score = { home: 1, away: 0 };
        expect(decideTie(round.ties[index]!, [first!, second!], true)).toBe(true);
        expect(round.ties[index]!.winner).toBe(second!.home);
        expect(round.ties[index]!.decided).toBe('away');
      }
    },
  );

  it.each([resultsOnlyMatch, simulateAggregate])(
    'draws the third tie’s first leg without extra time or penalties, then decides the return',
    (play) => {
      const { w, round, fixtures } = fixture();
      const [first, second] = legsOf(w, fixtures, 'cwc', 2, 2) as [Fixture, Fixture];
      expect(first.id).toBe(`${w.year}:cwc:k2:2`);
      // A bounded deterministic corpus reaches a drawn first leg on both settlement paths.
      let draw: ReturnType<typeof play>['record'] | undefined;
      for (let seed = 0; seed < 32; seed++) {
        w.seed = `third-tie-draw:${seed}`;
        const record = play(w, first, tieRule(first, fixtures, false)).record;
        if (record.score.home === record.score.away) {
          draw = record;
          break;
        }
      }
      expect(draw).toBeDefined();
      expect(draw!.shootout).toBeUndefined();
      expect(draw!.regulation).toBeUndefined();
      expect(draw!.metrics[0][M.minutes]).toBe(90);
      first.score = draw!.score;
      const returned = play(w, second, tieRule(second, fixtures, false)).record;
      second.score = returned.score;
      second.shootout = returned.shootout;
      expect(decideTie(round.ties[2]!, [first, second], false)).toBe(true);
      expect(round.ties[2]!.winner).toBeDefined();
    },
  );

  it('keeps a drawn single match at index 2 decisive and honours an explicit first leg without its partner', () => {
    const { w, fixtures } = fixture(1);
    const f = fixtures[2]!;
    expect(f.leg).toBeUndefined();
    expect(tieRule(f, fixtures, true)).toEqual({ awayGoals: false });
    let shootout: Fixture['shootout'];
    for (let seed = 0; seed < 32; seed++) {
      w.seed = `single-match-draw:${seed}`;
      const record = resultsOnlyMatch(w, f, tieRule(f, fixtures, true)).record;
      if (record.shootout) {
        shootout = record.shootout;
        break;
      }
    }
    expect(shootout).toBeDefined();
    expect(tieRule({ ...f, leg: 1 }, [f], true)).toBeUndefined();
    expect(tieRule({ ...f, leg: 2 }, [f], true)).toEqual({ awayGoals: false });
  });
});
