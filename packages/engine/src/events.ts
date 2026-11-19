/**
 * The club's events, wherever the world keeps them (→SAVE-32, →ARCH-36). Events of seasons before
 * last season leave memory at a save (`coldEventCount`): their rows stay in the record store, cold,
 * and `w.eventsBase` counts them, so an event's absolute index — its place among every event, its
 * `event` row key and the index news IDs and cursors name — is `eventsBase + position`. Last season
 * stays in memory (its books are read at this season's plans). Every read of an event that may be
 * older goes through these accessors, which read memory and the store in absolute order; reading
 * never changes an outcome (→ARCH-5).
 */
import { recordStoreOf, type RowFilter, type StoredRow } from '../../contracts/src/record-store';
import type { Event, World } from '../../contracts/src/types';
import { eventsInSeason } from './season-index';

export function addEvent(
  w: Pick<World, 'events' | 'year' | 'round' | 'currency'>,
  kind: string,
  title: string,
  detail: string,
  amount?: string,
) {
  w.events.push({
    year: w.year,
    round: w.round,
    kind,
    title,
    detail,
    ...(amount ? { amount, currency: w.currency } : {}),
  });
}

type Events = Pick<World, 'events' | 'eventsBase'>;

/** An event with its absolute index. */
export interface IndexedEvent {
  index: number;
  event: Event;
}

/** How many events have left memory: the absolute index of the first one memory holds. */
export const eventsBase = (w: Events) => w.eventsBase ?? 0;
/** Every event the world has recorded, in memory or cold. */
export const eventCount = (w: Events) => eventsBase(w) + w.events.length;

const parse = (row: StoredRow): IndexedEvent => ({
  index: row.seq,
  event: JSON.parse(row.data) as Event,
});

/** The cold events of `w` matching `filter`, in absolute order; none without a base or store. */
function coldEvents(w: Events, filter: RowFilter = {}): IndexedEvent[] {
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
  return row?.cold ? parse(row).event : undefined;
}

/**
 * The latest short cold read, kept per store: the daily view reads the same few earlier events
 * until this season's fill it, and cold rows never change.
 */
const shortCold = new WeakMap<object, { key: string; events: Event[] }>();
const SHORT_COLD = 256;

/** Every event from absolute index `from` on, in recorded order. */
export function eventsFrom(w: Events, from: number): Event[] {
  const base = eventsBase(w);
  if (from >= base) return from > base ? w.events.slice(from - base) : w.events;
  const start = Math.max(0, from);
  const store = recordStoreOf(w);
  const key = `${start}:${base}`;
  const short = base - start <= SHORT_COLD && store ? shortCold.get(store) : undefined;
  let cold = short?.key === key ? short.events : undefined;
  if (!cold) {
    cold = coldEvents(w, { seqFrom: start }).map(({ event }) => event);
    if (store && base - start <= SHORT_COLD) shortCold.set(store, { key, events: cold });
  }
  return [...cold, ...w.events];
}

/** The latest `n` events, oldest first. */
export const latestEvents = (w: Events, n: number) =>
  eventsFrom(w, Math.max(0, eventCount(w) - n));

/**
 * The events of season `year`, in recorded order. Events are appended in season order and a save
 * moves whole seasons, so a season memory holds any of is held whole and reads no store.
 */
export function eventsOfYear(w: Events, year: number): Event[] {
  const first = w.events[0];
  if (!eventsBase(w) || (first && year >= first.year)) return eventsInSeason(w, year);
  const cold = coldEvents(w, { year }).map(({ event }) => event);
  const held = eventsInSeason(w, year);
  return held.length ? [...cold, ...held] : cold;
}

/** The events whose kind starts with `prefix`, with their absolute indices, in recorded order. */
export function eventsOfKindPrefix(w: Events, prefix: string): IndexedEvent[] {
  const base = eventsBase(w);
  const held: IndexedEvent[] = [];
  w.events.forEach((event, position) => {
    if (event.kind.startsWith(prefix)) held.push({ index: base + position, event });
  });
  const cold = coldEvents(w, { kindPrefix: prefix });
  return cold.length ? [...cold, ...held] : held;
}

/**
 * How many events, from the first memory holds, belong to seasons before last season: they leave
 * memory at the next save (→SAVE-32). Last season's stay, since this season's plans read its books
 * (`lastSeasonTurnover`), and every scan of this season reads only memory.
 */
export function coldEventCount(w: Pick<World, 'events' | 'year'>): number {
  let n = 0;
  while (n < w.events.length && w.events[n]!.year < w.year - 1) n++;
  return n;
}

/** Drops the first `n` events from memory once their rows are saved cold. */
export function releaseEvents(w: Events, n: number) {
  if (n <= 0) return;
  w.events = w.events.slice(n);
  w.eventsBase = eventsBase(w) + n;
}
