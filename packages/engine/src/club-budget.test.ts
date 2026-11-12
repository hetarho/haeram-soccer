import { describe, expect, it } from 'vitest';
import type { SeasonArchive } from '../../contracts/src/types';
import { careerWorld } from './career.testkit';
import { addEvent } from './events';
import { budgetYears, clubBudgets, ownerSeasonFlows, seasonBudget } from './club-budget';

/** A taken-over club with one closed season of hand-kept books and this season's so far. */
function world() {
  const w = careerWorld({ seed: 'club-budget' });
  const year = w.year;
  w.year = year - 1;
  w.events = [];
  for (const [kind, amount] of [
    ['league-share', '400'],
    ['gate', '300'],
    ['sponsor:kit', '200'],
    ['transfer-out', '100'],
    ['operating-cost', '500'],
    ['operating-expenses', '120'],
    ['match-cost', '30'],
    ['transfer-in', '250'],
    ['staff-hire', '40'],
    ['owner-dividend', '10'],
    // The owner's own money is not the club's.
    ['owner-living', '999'],
  ] as const)
    addEvent(w, kind, kind, kind, amount);
  w.year = year;
  addEvent(w, 'gate', 'gate', 'gate', '50');
  addEvent(w, 'owner-business', 'business', 'business', '-70');
  addEvent(w, 'owner-living', 'living', 'living', '20');
  w.income = '50';
  w.expense = '0';
  w.history = [
    ...w.history,
    {
      ...structuredClone(w.history.at(-1) ?? ({} as SeasonArchive)),
      year: year - 1,
      rank: 4,
      cash: '777',
      currency: w.currency,
      // 25 of income the kept lines do not explain.
      income: '1025',
      expense: '950',
    } as SeasonArchive,
  ];
  w.owner!.takeover.year = year - 1;
  w.transfers = {
    facts: [
      { direction: 'in', loan: false, player: 'a', name: 'A', fee: '250', year: year - 1, day: 3 },
      { direction: 'out', loan: false, player: 'b', name: 'B', fee: '100', year: year - 1, day: 9 },
    ],
  } as never;
  return w;
}

describe('the club budget season by season', () => {
  it('groups a closed season into money in, fixed costs and money spent, with its transfers', () => {
    const w = world(),
      budget = seasonBudget(w, w.year - 1);
    expect(budget).toMatchObject({
      closed: true,
      income: '1025',
      expense: '950',
      cash: '777',
      rank: 4,
      fixed: '650',
      spent: '300',
      transfers: { in: 1, inFees: '250', out: 1, outFees: '100' },
    });
    const line = (key: string) => budget.lines.find((one) => one.key === key)?.amount;
    expect(line('broadcast')).toBe('400');
    expect(line('sponsors')).toBe('200');
    expect(line('sales')).toBe('100');
    expect(line('running')).toBe('500');
    expect(line('signings')).toBe('250');
    expect(line('people')).toBe('40');
    expect(line('dividend')).toBe('10');
    // What the kept lines do not explain is shown, never dropped.
    expect(line('olderIncome')).toBe('25');
    expect(line('olderExpense')).toBeUndefined();
  });

  it('reads the season in progress from its books so far, and every season in order', () => {
    const w = world();
    expect(seasonBudget(w, w.year)).toMatchObject({
      closed: false,
      income: '50',
      cash: w.cash,
      fixed: '0',
      spent: '0',
    });
    expect(budgetYears(w).at(-1)).toBe(w.year);
    expect(clubBudgets(w).map((season) => season.year)).toEqual(budgetYears(w));
    expect(ownerSeasonFlows(w)).toEqual({
      business: '-70',
      living: '20',
      injected: '0',
      dividend: '0',
    });
  });
});
