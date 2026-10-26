import { describe, expect, it } from 'vitest';
import {
  advanceRound,
  clubOf,
  financeProjection,
  financialBreakdown,
  leagueShare,
  parachutePayment,
  ratio,
} from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { FOUNDING } from './finance.testkit';

describe('the league distribution', () => {
  it('keeps half the lost share for the one season after a relegation', () => {
    const relegated = () => {
      const w = simulatedWorld(FOUNDING, { seasons: 1 }, DISABLED_RELEASE);
      // The season just closed was played a division higher: the club went down into this one.
      const last = w.history.length - 1;
      w.history[last] = { ...w.history[last], tier: clubOf(w).tier - 1 };
      return w;
    };
    const start = relegated();
    const tier = clubOf(start).tier,
      last = start.history.length - 1;
    const lost = BigInt(leagueShare(start, tier - 1)) - BigInt(leagueShare(start, tier));
    const parachute = ratio(lost.toString(), 500n, 1000n);
    expect(BigInt(parachute)).toBeGreaterThan(0n);
    expect(parachutePayment(start)).toBe(parachute);
    const line = financeProjection(start).seasonLines.find((row) => row.key === 'parachute');
    expect(line).toMatchObject({ label: '강등 보전금', amount: parachute });
    // The same world after the season's league rounds.
    const w = cachedWorld('relegated-season', () => {
      const w = relegated();
      while (w.round < 46) advanceRound(w, undefined, false);
      return w;
    });
    const paid = w.events.filter((e) => e.year === w.year && e.kind === 'parachute');
    expect(paid).toHaveLength(1);
    expect(paid[0].amount).toBe(parachute);
    expect(financialBreakdown(w).income.find((row) => row.key === 'parachute')?.amount).toBe(
      parachute,
    );
    // One season only; staying up or going up pays none.
    expect(parachutePayment({ ...w, year: w.year + 1 })).toBe('0');
    for (const before of [tier, tier + 1]) {
      const other = structuredClone(w);
      other.history[last].tier = before;
      expect(parachutePayment(other)).toBe('0');
      expect(financeProjection(other).lines.some((row) => row.key === 'parachute')).toBe(false);
    }
  });
});
