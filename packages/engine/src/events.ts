/**
 * The club's events, wherever the world keeps them (→SAVE-32, →ARCH-36). Events of seasons before
 * last season leave memory at a save (`coldEventCount`): their rows stay in the record store, cold,
 * and `w.eventsBase` counts them, so an event's absolute index — its place among every event, its
 * `event` row key and the index in its news id — is `eventsBase + position`. Last season stays in
 * memory: the season close and its reads still look at it. Every read of an older season goes
 * through these accessors, which read memory and the store in absolute order; reading never
 * changes an outcome (→ARCH-5).
 */
import { recordStoreOf, type RowFilter, type StoredRow } from '../../contracts/src/record-store';
import type { Event, World } from '../../contracts/src/types';
import { eventsInSeason } from './season-index';

type Events = Pick<World, 'events' | 'eventsBase'>;

/** How many events have left memory: the absolute index of the first one memory holds. */
export const eventsBase = (w: Events) => w.eventsBase ?? 0;
/** Every event the career has recorded, in memory or cold. */
export const eventCount = (w: Events) => eventsBase(w) + w.events.length;

const parse = (row: StoredRow) => JSON.parse(row.data) as Event;

/** The cold events of `w` matching `filter`, in absolute order; none without a base or store. */
function coldEvents(w: Events, filter: RowFilter = {}): Event[] {
  const base = eventsBase(w);
  if (!base) return [];
  const store = recordStoreOf(w);
  if (!store) return [];
  return store.rows('event', { ...filter, cold: true, seqTo: base - 1 }).map(parse);
}

/** The event at absolute index `index`, or undefined outside `0 … eventCount - 1`. */
export function eventAt(w: Events, index: number): Event | undefined {
  const base = eventsBase(w);
  if (index >= base) return w.events[index - base];
  if (index < 0) return undefined;
  const row = recordStoreOf(w)?.get('event', String(index));
  return row?.cold ? parse(row) : undefined;
}

/** Every event from absolute index `from` on, in recorded order. */
export function eventsFrom(w: Events, from: number): Event[] {
  const base = eventsBase(w);
  if (from >= base) return from > base ? w.events.slice(from - base) : w.events;
  return [...coldEvents(w, { seqFrom: Math.max(0, from) }), ...w.events];
}

/** The events of season `year`, in recorded order. */
export function eventsOfYear(w: Events, year: number): Event[] {
  const held = eventsInSeason(w, year);
  const cold = coldEvents(w, { year });
  return cold.length ? [...cold, ...held] : held;
}

/** The events whose kind starts with `prefix`, with their absolute indices, in recorded order. */
export function eventsOfKindPrefix(w: Events, prefix: string): { event: Event; index: number }[] {
  const base = eventsBase(w);
  const out: { event: Event; index: number }[] = [];
  const store = base ? recordStoreOf(w) : undefined;
  for (const row of store?.rows('event', { cold: true, seqTo: base - 1, kindPrefix: prefix }) ?? [])
    out.push({ event: parse(row), index: row.seq });
  w.events.forEach((event, i) => {
    if (event.kind.startsWith(prefix)) out.push({ event, index: base + i });
  });
  return out;
}

/** How many manager departures the career has recorded (→`World.managerDepartures`). */
function managerDepartureCount(w: Events & Pick<World, 'managerDepartures'>): number {
  return (
    w.managerDepartures ??
    eventsOfKindPrefix(w, 'manager-departure').filter(
      ({ event }) => event.kind === 'manager-departure',
    ).length
  );
}

export function addEvent(
  w: Pick<World, 'events' | 'year' | 'round' | 'currency'> &
    Partial<Pick<World, 'eventsBase' | 'managerDepartures'>>,
  kind: string,
  title: string,
  detail: string,
  amount?: string,
) {
  // Counted as it is added, so the count never needs the career's cold events (→SAVE-32).
  if (kind === 'manager-departure') w.managerDepartures = managerDepartureCount(w) + 1;
  w.events.push({
    year: w.year,
    round: w.round,
    kind,
    title,
    detail,
    ...(amount ? { amount, currency: w.currency } : {}),
  });
}

/**
 * How many events, from the first memory holds, belong to seasons before last season: they leave
 * memory at the next save (→SAVE-32). Last season's stay, since its close and its finance read
 * look at them; every scan that settles the current season reads only this season's events.
 */
export function coldEventCount(w: Pick<World, 'events' | 'year'>): number {
  let n = 0;
  while (n < w.events.length && w.events[n]!.year < w.year - 1) n++;
  return n;
}

/** Drops the first `n` events from memory once their rows are saved cold. */
export function releaseEvents(w: Pick<World, 'events' | 'eventsBase'>, n: number) {
  if (n <= 0) return;
  w.events = w.events.slice(n);
  w.eventsBase = (w.eventsBase ?? 0) + n;
}
