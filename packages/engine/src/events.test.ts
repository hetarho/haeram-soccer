import { describe, expect, it } from 'vitest';
import { attachRecordStore, type StoredRow } from '../../contracts/src/record-store';
import type { Event, World } from '../../contracts/src/types';
import { memoryRecordStore } from '../../../tests/fixtures/node-sqlite';
import {
  addEvent,
  coldEventCount,
  eventAt,
  eventCount,
  eventsFrom,
  eventsOfKindPrefix,
  eventsOfYear,
  releaseEvents,
} from './events';

const event = (year: number, kind: string): Event => ({
  year,
  round: 1,
  kind,
  title: kind,
  detail: '',
});

/** Six events over 1958–1960: two in each season. */
const events = () => [
  event(1958, 'manager-departure'),
  event(1958, 'transfer-in'),
  event(1959, 'manager-hire'),
  event(1959, 'manager-departure'),
  event(1960, 'transfer-out'),
  event(1960, 'promotion'),
];

const row = (index: number, e: Event, cold: boolean): StoredRow => ({
  table: 'event',
  key: String(index),
  seq: index,
  cold,
  data: JSON.stringify(e),
  year: e.year,
  kind: e.kind,
});

/** A world in 1960 whose first `cold` events sit cold in its store, the rest in memory. */
function world(cold: number): World {
  const all = events();
  const store = memoryRecordStore();
  store.write({ put: all.map((e, i) => row(i, e, i < cold)), delete: [] });
  const w = {
    year: 1960,
    round: 3,
    currency: 'GBP',
    events: all.slice(cold),
    ...(cold ? { eventsBase: cold } : {}),
  } as unknown as World;
  return attachRecordStore(w, store);
}

const kinds = (list: readonly Event[]) => list.map((e) => e.kind);

describe('events read across memory and store (→SAVE-32)', () => {
  it('answers every read alike whether earlier seasons are in memory or cold', () => {
    for (const w of [world(0), world(2)]) {
      expect(eventCount(w)).toBe(6);
      expect(eventAt(w, 1)?.kind).toBe('transfer-in');
      expect(eventAt(w, 5)?.kind).toBe('promotion');
      expect(eventAt(w, 6)).toBeUndefined();
      expect(eventAt(w, -1)).toBeUndefined();
      expect(kinds(eventsFrom(w, 0))).toEqual(kinds(events()));
      expect(kinds(eventsFrom(w, 3))).toEqual(['manager-departure', 'transfer-out', 'promotion']);
      expect(kinds(eventsOfYear(w, 1958))).toEqual(['manager-departure', 'transfer-in']);
      expect(kinds(eventsOfYear(w, 1960))).toEqual(['transfer-out', 'promotion']);
      expect(eventsOfKindPrefix(w, 'manager-').map(({ index }) => index)).toEqual([0, 2, 3]);
      expect(eventsOfKindPrefix(w, 'transfer-').map(({ event: e }) => e.kind)).toEqual([
        'transfer-in',
        'transfer-out',
      ]);
    }
  });

  it('moves only seasons before last season, and keeps absolute indices after a release', () => {
    const w = world(0);
    expect(coldEventCount(w)).toBe(2);
    releaseEvents(w, 2);
    expect(w.eventsBase).toBe(2);
    expect(w.events).toHaveLength(4);
    expect(coldEventCount(w)).toBe(0);
  });

  it('counts manager departures once, cold ones included, then as each is added', () => {
    const w = world(2);
    expect(w.managerDepartures).toBeUndefined();
    addEvent(w, 'manager-departure', 'a', 'b');
    expect(w.managerDepartures).toBe(3);
    addEvent(w, 'manager-hire', 'a', 'b');
    addEvent(w, 'manager-departure', 'a', 'b');
    expect(w.managerDepartures).toBe(4);
  });
});

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
