import type { Event, World } from '../../packages/contracts/src/types';
import { operatingCosts } from '../../packages/engine/src/finance';
import { SEASON_ROUNDS } from '../../packages/engine/src/calendar';

/** Exact league-round installments, not employment bonuses or termination payments. */
export interface SettledPayroll {
  playerWages: string;
  managerWages: string;
  coachingWages: string;
  payroll: string;
  operatingExpenses: string;
  loanRepayment: string;
  otherOperatingCosts: string;
  operatingCostAmount: string;
}
export interface PayrollSettlement extends SettledPayroll {
  year: number;
  currency: string;
  round: number;
}
const fields = [
  'playerWages',
  'managerWages',
  'coachingWages',
  'payroll',
  'operatingExpenses',
  'loanRepayment',
  'otherOperatingCosts',
  'operatingCostAmount',
] as const satisfies readonly (keyof SettledPayroll)[];

/**
 * Measurement-only boundary observer. addEvent pushes operating-cost synchronously after the
 * debit, before wages or policy can change again. Its amount excludes operating expenses and
 * loan installments. We recompute that same round's components and fail closed if they disagree.
 * No display prose is parsed. Array methods are nonenumerable; replacements are instrumented,
 * while retained/pruned historical events are never replayed into the observations.
 *
 * Only plain writable World.events data properties are supported. stop() restores its descriptor
 * and every array's push method, retaining whichever event array production assigned last.
 */
export function observeSettlementPayroll(world: World) {
  const descriptor = Object.getOwnPropertyDescriptor(world, 'events');
  if (!descriptor?.configurable || !descriptor.writable || !('value' in descriptor))
    throw new Error('Payroll observation requires a configurable, writable events data property');
  const arrays = new Map<Event[], PropertyDescriptor | undefined>();
  const settlements = new Map<string, PayrollSettlement>();
  let active = true;
  const key = (year: number, currency: string, round: number) => `${year}:${currency}:${round}`;

  const capture = (event: Event) => {
    if (event.kind !== 'operating-cost') return;
    if (
      event.year !== world.year ||
      event.round !== world.round ||
      event.currency !== world.currency ||
      event.amount === undefined
    )
      throw new Error('Payroll settlement event does not match the live year, round and currency');
    if (!Number.isInteger(event.round) || event.round < 1 || event.round > SEASON_ROUNDS)
      throw new Error('Payroll settlement round is outside the league season');
    const id = key(event.year, event.currency, event.round);
    if (settlements.has(id)) throw new Error(`Duplicate payroll settlement ${id}`);
    const payments = operatingCosts(world, world.round).payments;
    const playerWages = BigInt(payments.playerWages),
      managerWages = BigInt(payments.managerWage),
      coachingWages = BigInt(payments.staffWages ?? '0'),
      payroll = playerWages + managerWages + coachingWages,
      other =
        BigInt(payments.maintenance) +
        BigInt(payments.investment ?? '0') +
        BigInt(payments.academy ?? '0');
    if (payroll + other !== BigInt(event.amount))
      throw new Error(`Payroll components do not match operating-cost at ${id}`);
    settlements.set(id, {
      year: event.year,
      currency: event.currency,
      round: event.round,
      playerWages: playerWages.toString(),
      managerWages: managerWages.toString(),
      coachingWages: coachingWages.toString(),
      payroll: payroll.toString(),
      operatingExpenses: payments.expenses,
      loanRepayment: payments.loan ?? '0',
      otherOperatingCosts: other.toString(),
      operatingCostAmount: event.amount,
    });
  };

  const instrument = (events: Event[]) => {
    if (!Array.isArray(events)) throw new Error('Payroll observation requires an event array');
    if (!arrays.has(events)) {
      const pushDescriptor = Object.getOwnPropertyDescriptor(events, 'push');
      const push = events.push;
      arrays.set(events, pushDescriptor);
      Object.defineProperty(events, 'push', {
        configurable: true,
        writable: true,
        enumerable: false,
        value: function (this: Event[], ...items: Event[]) {
          if (active && this === events) for (const event of items) capture(event);
          return Reflect.apply(push, this, items) as number;
        },
      });
    }
    return events;
  };
  let events = instrument(world.events);
  Object.defineProperty(world, 'events', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: () => events,
    set: (next: Event[]) => {
      events = instrument(next);
    },
  });

  return {
    /** Missing installments are errors even if event retention has already pruned the ledger. */
    read(year: number, currency: string, firstRound: number, lastRound: number) {
      if (
        !Number.isInteger(firstRound) ||
        !Number.isInteger(lastRound) ||
        firstRound < 1 ||
        firstRound > SEASON_ROUNDS + 1 ||
        lastRound < 0 ||
        lastRound > SEASON_ROUNDS ||
        firstRound > lastRound + 1
      )
        throw new Error('Invalid payroll observation round coverage');
      const records: PayrollSettlement[] = [];
      for (let round = firstRound; round <= lastRound; round++) {
        const id = key(year, currency, round),
          record = settlements.get(id);
        if (!record) throw new Error(`Missing payroll settlement ${id}`);
        records.push({ ...record });
      }
      const totals = Object.fromEntries(
        fields.map((field) => [
          field,
          records.reduce((sum, record) => sum + BigInt(record[field]), 0n).toString(),
        ]),
      ) as unknown as SettledPayroll;
      return { firstRound, lastRound, count: records.length, ...totals, records };
    },
    stop() {
      if (!active) return;
      active = false;
      Object.defineProperty(world, 'events', { ...descriptor, value: events });
      for (const [array, original] of arrays) {
        if (original) Object.defineProperty(array, 'push', original);
        else Reflect.deleteProperty(array, 'push');
      }
    },
  };
}
