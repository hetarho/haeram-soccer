/**
 * The club's money season by season, a read leaf the UI may import (→ARCH-4): each owned season's
 * ledger (→ECON-10) grouped into what came in, the fixed costs that went out every round and the
 * money spent on decisions — signings, people, works, the owner's dividend — with that season's
 * transfers. Past seasons read the archive's totals and the events kept since the takeover; the
 * season in progress reads the books so far.
 */
import { message as sourceMessage } from '../../contracts/src/messages';
import type { Event, TransferFact, World } from '../../contracts/src/types';
import { eventsInSeason } from './season-index';
import { ownSeasons } from './player-state';

export type BudgetGroup = 'income' | 'fixed' | 'spend';
interface LineRule {
  key: string;
  group: BudgetGroup;
  label: string;
  kinds: readonly string[];
  /** Kinds matched by prefix, for the sponsor slots. */
  prefix?: string;
}
/** Every ledger kind of club money in one line; the owner's own money (business, living) is not here. */
export const BUDGET_LINES: readonly LineRule[] = [
  {
    key: 'broadcast',
    group: 'income',
    label: sourceMessage('budget.line.broadcast'),
    kinds: ['league-share', 'league-merit', 'parachute'],
  },
  {
    key: 'gate',
    group: 'income',
    label: sourceMessage('copy.finance.21979537d2'),
    kinds: ['gate'],
  },
  {
    key: 'sponsors',
    group: 'income',
    label: sourceMessage('budget.line.sponsors'),
    kinds: [],
    prefix: 'sponsor:',
  },
  {
    key: 'prizes',
    group: 'income',
    label: sourceMessage('budget.line.prizes'),
    kinds: ['match-bonus', 'cup-prize', 'cup-honor', 'europe-prize', 'europe-honor'],
  },
  {
    key: 'commercial',
    group: 'income',
    label: sourceMessage('budget.line.commercial'),
    kinds: ['tour', 'campaign-result'],
  },
  {
    key: 'sales',
    group: 'income',
    label: sourceMessage('copy.intervention.5ea61dab56'),
    kinds: ['transfer-out', 'free-transfer-compensation'],
  },
  {
    key: 'injection',
    group: 'income',
    label: sourceMessage('copy.fan_mood.3881f2a2d6'),
    kinds: ['owner-injection'],
  },
  {
    key: 'running',
    group: 'fixed',
    label: sourceMessage('copy.finance.9df2ce4df3'),
    kinds: ['operating-cost'],
  },
  {
    key: 'expenses',
    group: 'fixed',
    label: sourceMessage('copy.FinancialBreakdown.2d914c9be2'),
    kinds: ['operating-expenses'],
  },
  {
    key: 'matchdays',
    group: 'fixed',
    label: sourceMessage('copy.finance.aeee208c2a'),
    kinds: ['match-cost'],
  },
  {
    key: 'loan',
    group: 'fixed',
    label: sourceMessage('copy.FinancialBreakdown.ddebd211b6'),
    kinds: ['loan-repayment'],
  },
  {
    key: 'signings',
    group: 'spend',
    label: sourceMessage('copy.finance.9c050684a4'),
    kinds: ['transfer-in'],
  },
  {
    key: 'people',
    group: 'spend',
    label: sourceMessage('budget.line.people'),
    kinds: ['manager-hire', 'manager-renew', 'staff-hire', 'staff-renew', 'staff-release'],
  },
  {
    key: 'works',
    group: 'spend',
    label: sourceMessage('copy.finance.da397a5520'),
    kinds: ['facility'],
  },
  {
    key: 'other',
    group: 'spend',
    label: sourceMessage('budget.line.otherSpend'),
    kinds: ['campaign', 'training', 'ballon-dor-bonus'],
  },
  {
    key: 'dividend',
    group: 'spend',
    label: sourceMessage('copy.fan_mood.eb9f33a674'),
    kinds: ['owner-dividend'],
  },
];
const ruleOf = (kind: string) =>
  BUDGET_LINES.find(
    (rule) => rule.kinds.includes(kind) || (rule.prefix && kind.startsWith(rule.prefix)),
  );

export interface BudgetLine {
  key: string;
  group: BudgetGroup;
  label: string;
  amount: string;
}
export interface SeasonBudget {
  year: number;
  /** The money the season's books were kept in. */
  currency: string;
  /** False for the season in progress. */
  closed: boolean;
  income: string;
  expense: string;
  /** Cash when the season closed, or now. */
  cash: string;
  /** League place at the close; absent for the season in progress. */
  rank?: number;
  /** Every line with money, in `BUDGET_LINES` order, and one for what no kept entry explains. */
  lines: BudgetLine[];
  fixed: string;
  spent: string;
  transfers: { in: number; inFees: string; out: number; outFees: string };
}

/** The seasons with books to read, oldest first: every owned season and the one in progress. */
export function budgetYears(w: World): number[] {
  return [...new Set([...ownSeasons(w).map((season) => season.year), w.year])].sort(
    (a, b) => a - b,
  );
}

function sum(events: readonly Event[]) {
  return events.reduce((total, event) => total + BigInt(event.amount!), 0n);
}

/** One season's books grouped for the owner (→`BUDGET_LINES`). */
export function seasonBudget(
  w: World,
  year: number,
  facts: readonly TransferFact[] = (w.transfers?.facts ?? []).filter((fact) => fact.year === year),
): SeasonBudget {
  const archive = year === w.year ? undefined : ownSeasons(w).find((s) => s.year === year);
  const currency = archive?.currency ?? w.currency,
    entries = eventsInSeason(w, year).filter(
      (event) => event.amount !== undefined && event.currency === currency && ruleOf(event.kind),
    );
  const lines: BudgetLine[] = [];
  for (const rule of BUDGET_LINES) {
    const amount = sum(entries.filter((event) => ruleOf(event.kind) === rule));
    if (amount !== 0n)
      lines.push({
        key: rule.key,
        group: rule.group,
        label: rule.label,
        amount: amount.toString(),
      });
  }
  const income = BigInt(archive?.income ?? w.income),
    expense = BigInt(archive?.expense ?? w.expense);
  const total = (group: BudgetGroup) =>
    lines
      .filter((line) => line.group === group)
      .reduce((all, line) => all + BigInt(line.amount), 0n);
  // A total the kept entries do not explain (books from before the ledger kept every line).
  const unexplainedIncome = income - total('income'),
    unexplainedExpense = expense - total('fixed') - total('spend');
  if (unexplainedIncome !== 0n)
    lines.push({
      key: 'olderIncome',
      group: 'income',
      label: sourceMessage('copy.finance.746c39bf26'),
      amount: unexplainedIncome.toString(),
    });
  if (unexplainedExpense !== 0n)
    lines.push({
      key: 'olderExpense',
      group: 'spend',
      label: sourceMessage('copy.finance.746c39bf26'),
      amount: unexplainedExpense.toString(),
    });
  const moves = (direction: 'in' | 'out') =>
    facts.filter(
      (fact) => fact.direction === direction && (fact.currency ?? currency) === currency,
    );
  const fees = (direction: 'in' | 'out') =>
    moves(direction)
      .reduce((all, fact) => all + BigInt(fact.fee), 0n)
      .toString();
  return {
    year,
    currency,
    closed: !!archive,
    income: income.toString(),
    expense: expense.toString(),
    cash: archive?.cash ?? w.cash,
    rank: archive?.rank,
    lines,
    fixed: total('fixed').toString(),
    spent: (expense - total('fixed')).toString(),
    transfers: {
      in: moves('in').length,
      inFees: fees('in'),
      out: moves('out').length,
      outFees: fees('out'),
    },
  };
}

/**
 * Every season's books, oldest first (→`budgetYears`). The worker reads them from the whole ledger;
 * the view carries only its latest entries.
 */
export function clubBudgets(w: World): SeasonBudget[] {
  const facts = new Map<number, TransferFact[]>();
  for (const fact of w.transfers?.facts ?? []) {
    const list = facts.get(fact.year);
    if (list) list.push(fact);
    else facts.set(fact.year, [fact]);
  }
  return budgetYears(w).map((year) => seasonBudget(w, year, facts.get(year) ?? []));
}

/** The owner's own money this season so far, from its ledger entries (→OWNER-7/8/9/11). */
export function ownerSeasonFlows(w: World) {
  const flow = (kind: string) =>
    eventsInSeason(w, w.year)
      .filter((event) => event.kind === kind && event.amount && event.currency === w.currency)
      .reduce((sum, event) => sum + BigInt(event.amount!), 0n)
      .toString();
  return {
    business: flow('owner-business'),
    living: flow('owner-living'),
    injected: flow('owner-injection'),
    dividend: flow('owner-dividend'),
  };
}
