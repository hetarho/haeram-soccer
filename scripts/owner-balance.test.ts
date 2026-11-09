import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bookPlayerPayroll,
  type Career,
  econ36Report,
  econReport,
  payrollAccounting,
  seasonPayroll,
} from './owner-balance';

/** Retained report data only: importing and reporting must not generate or advance a world. */
const observed = (lastRound = 46) =>
  seasonPayroll(
    {
      firstRound: 1,
      lastRound,
      count: lastRound,
      playerWages: String(2000 * lastRound),
      managerWages: String(400 * lastRound),
      coachingWages: String(100 * lastRound),
      payroll: String(2500 * lastRound),
      operatingExpenses: String(500 * lastRound),
      loanRepayment: String(150 * lastRound),
      otherOperatingCosts: String(50 * lastRound),
      operatingCostAmount: String(2550 * lastRound),
      records: Array.from({ length: lastRound }, (_, i) => ({
        year: 1998,
        currency: 'GBP',
        round: i + 1,
        playerWages: '2000',
        managerWages: '400',
        coachingWages: '100',
        payroll: '2500',
        operatingExpenses: '500',
        loanRepayment: '150',
        otherOperatingCosts: '50',
        operatingCostAmount: '2550',
      })),
    },
    1998,
    'GBP',
    230,
    138000,
    103500,
  );

const fixture = (): Career => ({
  code: 'ENG',
  tier: 'midsize',
  traits: 'none',
  policy: 'none',
  build: true,
  seed: 'retained-report-0',
  club: 'retained-club',
  start: {
    division: 1,
    place: 1,
    reach: 10,
    anchor: 100,
    fortune: 100,
    price: 10,
    lastIncome: 1000,
    debt: 0,
    cash: 100,
    distribution: 100,
    lastWages: 200,
  },
  first: {
    league: 400,
    cups: 0,
    leagueGate: 400,
    cupGate: 0,
    commercial: 200,
    other: 0,
    book: { distribution: 400, gate: 400, commercial: 200 },
  },
  seasons: [
    {
      year: 1998,
      tier: 1,
      lowest: false,
      rank: 1,
      sources: { competition: 400, matchday: 400, commercial: 200, sales: 0, owner: 0, other: 0 },
      expense: 1000,
      ...observed(),
      facilitySpend: 0,
      real: 1,
      cash: 100,
      fortune: 90,
      living: 1,
      dividend: 0,
      fanMood: 50,
      moodLow: 50,
      belowFloor: 0,
    },
  ],
});

afterEach(() => vi.restoreAllMocks());

describe('reference-career payroll reporting', () => {
  it('keeps raw settled components and sampled provenance in the same season price units', () => {
    const exact = observed();
    expect(exact).toMatchObject({
      wages: 500,
      sampledWages: 600,
      sampledPlayerWages: 450,
      wageAccounting: {
        version: 'settled-payroll-v1',
        year: 1998,
        currency: 'GBP',
        priceUnit: 230,
        playerWages: '92000',
        managerWages: '18400',
        coachingWages: '4600',
        payroll: '115000',
        operatingExpenses: '23000',
        firstRound: 1,
        lastRound: 46,
        count: 46,
        completeSeason: true,
      },
    });
    expect(observed(12).wageAccounting.completeSeason).toBe(false);
    expect(bookPlayerPayroll(exact)).toEqual({ amount: 400, label: 'exact player-only' });
  });

  it('reports the modeled total in the wage band and player-only against NPC books', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const career = fixture();
    econReport([career]);
    econ36Report([career]);
    const report = log.mock.calls.flat().join('\n');
    expect(report).toContain('modeled player + manager/coaching wage bill');
    expect(report).toContain('50.0% (1) ok; 1 exact settled; 0 legacy sampled/unknown');
    expect(report).toContain('2 (exact player-only)');
    expect(report).not.toContain('2.5 (exact player-only)');
  });

  it('preserves unmarked retained wages and labels the NPC scope mismatch', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const career = fixture();
    const season = career.seasons[0]!;
    delete season.wageAccounting;
    delete season.sampledWages;
    delete season.sampledPlayerWages;
    season.wages = 600;
    const before = JSON.stringify(career);
    econReport([career]);
    econ36Report([career]);
    expect(JSON.stringify(career)).toBe(before);
    const report = log.mock.calls.flat().join('\n');
    expect(report).toContain('60.0% (1) ok; 0 exact settled; 1 legacy sampled/unknown');
    expect(report).toContain('- (legacy total payroll / NPC player-only mismatch)');
    expect(report).not.toContain('exact player-only');
    expect(payrollAccounting([fixture().seasons[0]!, season])).toBe(
      '1 exact settled; 1 legacy sampled/unknown',
    );
  });

  it('labels the legacy Growth player-only sample without treating it as settled', () => {
    const career = fixture();
    const season = career.seasons[0]!;
    delete season.wageAccounting;
    season.growth = {
      rating: 50,
      npcMedian: 50,
      npcBest: 55,
      npcClubs: 19,
      level: 50,
      xi: [],
      squad: 21,
      squadPaid: 500,
      squadFit: 600,
      playerWagesPaid: 450,
      signings: [],
      offered: [],
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    econ36Report([career]);
    expect(log.mock.calls.flat().join('\n')).toContain('2.25 (sampled player-only)');
    expect(payrollAccounting([season])).toBe('0 exact settled; 1 legacy sampled/unknown');
  });
});
