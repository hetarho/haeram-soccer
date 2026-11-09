import { describe, expect, it } from 'vitest';
import type { World } from '../../packages/contracts/src/types';
import { operatingCosts } from '../../packages/engine/src/finance';
import { addEvent } from '../../packages/engine/src/events';
import { debit } from '../../packages/engine/src/transactions';
import { observeSettlementPayroll } from './settlement-payroll';

/** Minimal fixed-cost input: no fixtures, generated world or day progression. */
function fixture() {
  return {
    year: 2025,
    round: 0,
    currency: 'GBP',
    seed: 'payroll-observation',
    playerClub: 'own',
    clubs: [{ id: 'own', country: 'ENG', tier: 0 }],
    players: [{ id: 'player', status: 'active', wage: '4600' }],
    manager: { wage: '920' },
    staff: [{ wage: '460' }],
    stadium: 0,
    trainingGround: 0,
    academyFacility: 0,
    operatingExpenses: '2300',
    cash: '1000000000000',
    income: '0',
    expense: '0',
    events: [],
  } as unknown as World;
}
/** Same debit and event boundary as settleRound, independent of the observer. */
function emit(w: World, wrongAmount?: string) {
  const cost = operatingCosts(w, w.round);
  debit(w, cost.nextRound, true);
  addEvent(
    w,
    'operating-cost',
    'opaque title',
    'No monetary components in this prose',
    wrongAmount ??
      (
        BigInt(cost.nextRound) -
        BigInt(cost.payments.expenses) -
        BigInt(cost.payments.loan ?? '0')
      ).toString(),
  );
}

describe('exact settled payroll observation', () => {
  it('captures a wage change after the opening sample and separates every component', () => {
    const w = fixture(),
      observation = observeSettlementPayroll(w);
    const sample = operatingCosts(w, 1).payments.playerWages;
    w.players[0].wage = '9200';
    w.round = 1;
    emit(w);
    const read = observation.read(2025, 'GBP', 1, 1);
    expect(sample).toBe('100');
    expect(read).toMatchObject({
      count: 1,
      playerWages: '200',
      managerWages: '20',
      coachingWages: '10',
      payroll: '230',
      operatingExpenses: '50',
      loanRepayment: '0',
    });
    expect(BigInt(read.payroll) + BigInt(read.otherOperatingCosts)).toBe(
      BigInt(read.operatingCostAmount),
    );
    observation.stop();
  });

  it('preserves enumerable facts and cloning, handles replacements/pruning and restores methods', () => {
    const observed = fixture(),
      control = structuredClone(observed);
    const initialDescriptor = Object.getOwnPropertyDescriptor(observed, 'events');
    const observation = observeSettlementPayroll(observed);
    const firstArray = observed.events;
    for (const w of [observed, control]) {
      w.round = 1;
      emit(w);
      w.events = w.events.filter(() => false); // retention can remove the first receipt
      w.players[0].wage = '6900';
      w.round = 2;
      emit(w);
    }
    expect(JSON.stringify(observed)).toBe(JSON.stringify(control));
    expect(structuredClone(observed)).toEqual(control);
    expect(Object.keys(observed.events)).toEqual(Object.keys(control.events));
    expect(observation.read(2025, 'GBP', 1, 2)).toMatchObject({
      count: 2,
      playerWages: '250',
      managerWages: '40',
      coachingWages: '20',
    });
    observation.stop();
    observation.stop();
    expect(Object.getOwnPropertyDescriptor(observed, 'events')).toEqual({
      ...initialDescriptor,
      value: observed.events,
    });
    expect(Object.hasOwn(observed.events, 'push')).toBe(false);
    expect(Object.hasOwn(firstArray, 'push')).toBe(false);
    expect(observed).toEqual(control);
  });

  it('keeps year/currency coverage distinct and admits an empty partial continuation', () => {
    const w = fixture(),
      observation = observeSettlementPayroll(w);
    w.round = 46;
    emit(w);
    w.year = 2026;
    w.currency = 'EUR';
    w.round = 1;
    w.events = [];
    emit(w);
    expect(observation.read(2025, 'GBP', 46, 46).count).toBe(1);
    expect(observation.read(2026, 'EUR', 1, 1).count).toBe(1);
    expect(observation.read(2026, 'EUR', 2, 1).payroll).toBe('0');
    expect(() => observation.read(2026, 'GBP', 1, 1)).toThrow('Missing');
    observation.stop();
  });

  it('fails closed on mismatched, duplicate and missing installments', () => {
    const w = fixture(),
      observation = observeSettlementPayroll(w);
    w.round = 1;
    expect(() => emit(w, '1')).toThrow('do not match');
    emit(w);
    expect(() => w.events.push({ ...w.events[0] })).toThrow('Duplicate');
    expect(() => observation.read(2025, 'GBP', 1, 2)).toThrow('Missing');
    expect(() => observation.read(2025, 'GBP', 0, 1)).toThrow('coverage');
    expect(() => w.events.push({ ...w.events[0], currency: 'EUR', round: 2 })).toThrow(
      'does not match',
    );
    observation.stop();
  });
});
