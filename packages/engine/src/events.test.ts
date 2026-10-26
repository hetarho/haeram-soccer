import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { addEvent } from './events';

const eventState = (): Pick<World, 'events' | 'year' | 'round' | 'currency'> => ({
  events: [],
  year: 1998,
  round: 7,
  currency: 'FRF',
});

describe('event append', () => {
  it('appends in call order and retains each event at its game date and currency', () => {
    const w = eventState();
    const events = w.events;
    addEvent(w, 'offer', 'First', 'Offer received');
    addEvent(w, 'sale', 'Second', 'Sale settled', '12345678901234567890');
    w.year = 1999;
    w.round = 0;
    w.currency = 'EUR';
    addEvent(w, 'wage', 'Third', 'Wage paid', '-123');
    expect(w.events).toBe(events);
    expect(w.events).toEqual([
      { year: 1998, round: 7, kind: 'offer', title: 'First', detail: 'Offer received' },
      {
        year: 1998,
        round: 7,
        kind: 'sale',
        title: 'Second',
        detail: 'Sale settled',
        amount: '12345678901234567890',
        currency: 'FRF',
      },
      {
        year: 1999,
        round: 0,
        kind: 'wage',
        title: 'Third',
        detail: 'Wage paid',
        amount: '-123',
        currency: 'EUR',
      },
    ]);
  });

  it.each([undefined, ''])('omits monetary metadata for amount %s', (amount) => {
    const w = eventState();
    addEvent(w, 'note', 'Title', 'Detail', amount);
    expect(w.events).toEqual([
      { year: 1998, round: 7, kind: 'note', title: 'Title', detail: 'Detail' },
    ]);
  });

  it('retains a zero monetary amount and its currency', () => {
    const w = eventState();
    addEvent(w, 'payment', 'Title', 'Detail', '0');
    expect(w.events[0]).toEqual({
      year: 1998,
      round: 7,
      kind: 'payment',
      title: 'Title',
      detail: 'Detail',
      amount: '0',
      currency: 'FRF',
    });
  });
});
