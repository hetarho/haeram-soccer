import { describe, expect, it } from 'vitest';
import type { Event, SeasonArchive, World } from '../../contracts/src/types';
import { lastSeasonTurnover, seasonTurnover } from './finance-read';
import {
  lastSeasonTurnover as financeLastTurnover,
  seasonTurnover as financeTurnover,
} from './finance';

/** Synthetic books only: no generation, progression or settlement is needed for these reads. */
function books() {
  return {
    year: 1970,
    playerClub: 'synthetic',
    clubs: [{ id: 'synthetic', country: 'ENG' }],
    currency: 'GBP-LSD',
    income: '5000',
    events: [],
    history: [],
  } as unknown as World;
}
function entry(year: number, kind: string, amount?: string, currency = 'GBP-LSD'): Event {
  return { year, round: 0, kind, title: 'Synthetic entry', detail: '', amount, currency };
}
function close(w: World, income = '5000') {
  w.history.push({ year: w.year - 1, currency: w.currency, income } as SeasonArchive);
}

describe('canonical turnover reads', () => {
  it('keeps the finance entry points on the same canonical readers', () => {
    expect(financeTurnover).toBe(seasonTurnover);
    expect(financeLastTurnover).toBe(lastSeasonTurnover);
  });

  it('excludes current sales, leaver compensation and capital only in this currency', () => {
    const w = books();
    w.events = [
      entry(1969, 'owner-injection', '9000'),
      entry(1970, 'gate', '1000'),
      entry(1970, 'transfer-out', '500'),
      entry(1970, 'free-transfer-compensation', '100'),
      entry(1970, 'owner-injection', '1000'),
      entry(1970, 'owner-injection', '9000', 'GBP'),
      entry(1970, 'owner-injection'),
      entry(1971, 'owner-injection', '9000'),
    ];
    expect(seasonTurnover(w)).toBe(3400n);
  });

  it('preserves the current-season tail scan and its unclamped bigint output', () => {
    const w = books();
    w.income = '100';
    w.events = [
      entry(1970, 'owner-injection', '9000'),
      entry(1969, 'gate', '1000'),
      entry(1970, 'owner-injection', '150'),
    ];
    expect(seasonTurnover(w)).toBe(-50n);
  });

  it('keeps legacy residual income while excluding only recorded non-turnover', () => {
    const w = books();
    close(w);
    w.events = [
      entry(1968, 'owner-injection', '9000'),
      entry(1969, 'gate', '1000'),
      entry(1969, 'legacy-income', '250'),
      entry(1969, 'transfer-out', '500'),
      entry(1969, 'free-transfer-compensation', '100'),
      entry(1969, 'owner-injection', '1000'),
      entry(1969, 'owner-injection', '9000', 'GBP'),
      entry(1969, 'owner-injection'),
      entry(1970, 'owner-injection', '9000'),
    ];
    // The archive also holds 2,150 of older income without a classified event.
    expect(lastSeasonTurnover(w)).toBe('3400');
  });

  it('keeps unclassified archived income and clamps a negative prior turnover to zero', () => {
    const w = books();
    close(w, '1000');
    expect(lastSeasonTurnover(w)).toBe('1000');
    w.events.push(entry(1969, 'owner-injection', '1200'));
    expect(lastSeasonTurnover(w)).toBe('0');
  });

  it('requires the immediately preceding owned season', () => {
    const w = books();
    expect(lastSeasonTurnover(w)).toBeUndefined();
    close(w);
    w.owner = { takeover: { year: 1970 } } as World['owner'];
    expect(lastSeasonTurnover(w)).toBeUndefined();
    delete w.owner;
    w.history[0].year = 1968;
    expect(lastSeasonTurnover(w)).toBeUndefined();
  });

  it('converts prior turnover once at the canonical currency rate', () => {
    const w = books();
    w.year = 1971;
    close(w, '24000');
    w.events.push(entry(1970, 'owner-injection', '12000'));
    w.currency = 'GBP';
    expect(lastSeasonTurnover(w)).toBe('5000');
    expect(lastSeasonTurnover(w)).toBe('5000');
    w.history[0].currency = 'EUR';
    expect(lastSeasonTurnover(w)).toBeUndefined();
    w.history[0].currency = 'GBP-LSD';
    w.currency = 'EUR';
    expect(lastSeasonTurnover(w)).toBeUndefined();
  });
});
