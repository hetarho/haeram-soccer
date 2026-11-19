import { describe, expect, it } from 'vitest';
import {
  attachRecordStore,
  type RecordChanges,
  type RecordStore,
} from '../../../../packages/contracts/src/record-store';
import type { PersonCareer, World } from '../../../../packages/contracts/src/types';
import { peopleOf, personOf, restorePerson } from '../../../../packages/engine/src/person-careers';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { addEvent, eventAt, eventsOfKindPrefix } from '../../../../packages/engine/src/events';
import { newsBefore, newsPage, newsTotal } from '../../../../packages/engine/src/news';
import {
  archiveAt,
  archiveCount,
  archiveOf,
  archiveSummaries,
  archiveYears,
  coldArchiveCount,
} from '../../../../packages/engine/src/archives';
import { moveColdPeople, saveMovingCold } from './coldMovers';
import { RowSaver } from './rowSaver';
import { rowsToWorld, worldFacts } from './worldRows';

const person = (id: string, extra: Partial<PersonCareer> = {}): PersonCareer => ({
  id,
  name: id,
  born: 1900,
  position: 'CM',
  professionalism: 3,
  qualities: { understanding: 3, teaching: 3, judgement: 3 },
  playing: 'retired',
  employment: [],
  mentors: [],
  ...extra,
});
/** A synthetic world of four people, two of them without a current role; not playable. */
function tinyWorld() {
  return {
    engine: '0.9.0',
    catalog: 'test-catalog',
    catalogHash: 'h1',
    id: 'world-1',
    revision: 1,
    year: 1960,
    playerClub: 'c1',
    players: [],
    manager: { id: 'm', person: 'kept' },
    ownMatches: [],
    history: [],
    events: [],
    people: {
      gone1: person('gone1'),
      active: person('active', { playing: 'active', club: 'c1' }),
      gone2: person('gone2'),
      kept: person('kept'),
    },
  } as unknown as World;
}
/** A store whose writes fail while `fail.now` holds. */
function failingStore(fail: { now: boolean }) {
  const inner = memoryRecordStore();
  const store: RecordStore = {
    ...inner,
    write(changes: RecordChanges) {
      if (fail.now) throw new Error('quota');
      inner.write(changes);
    },
  };
  return store;
}

describe('people leave memory at a save (→SAVE-32)', () => {
  it('writes them cold in the one save, then drops them from memory in order', () => {
    const w = tinyWorld();
    const store = memoryRecordStore();
    attachRecordStore(w, store);
    const saver = new RowSaver(store);
    saver.save(w);
    const complete = worldFacts(w);
    let writes = 0;
    const counted: RecordStore = {
      ...store,
      write: (changes) => {
        writes++;
        store.write(changes);
      },
    };
    const counting = new RowSaver(counted);
    counting.prime(rowsToWorld(store, { includeCold: false }));
    expect(peopleOf(w)).toHaveLength(4);
    expect(saveMovingCold(w, counting)).toMatchObject({ written: 2, deleted: 0 });
    expect(writes).toBe(1);
    expect(Object.keys(w.people!)).toEqual(['active', 'kept']);
    expect(peopleOf(w).map((p) => p.id)).toEqual(['active', 'kept']);
    expect(store.get('person', 'gone1')?.cold).toBe(true);
    expect(store.get('person', 'gone2')?.cold).toBe(true);
    expect(personOf(w, 'gone2')).toEqual(person('gone2'));
    expect(worldFacts(w)).toBe(complete);
    // Opening the game reads only what memory held.
    expect(Object.keys(rowsToWorld(store, { includeCold: false }).people!)).toEqual([
      'active',
      'kept',
    ]);
    // Nothing more to move: a later save writes nothing.
    expect(saveMovingCold(w, counting)).toMatchObject({ written: 0, deleted: 0 });
  });

  it('removes nothing when the write fails, and the marks do not outlive it', () => {
    const fail = { now: false };
    const store = failingStore(fail);
    const w = attachRecordStore(tinyWorld(), store);
    const saver = new RowSaver(store);
    saver.save(w);
    fail.now = true;
    expect(() => saveMovingCold(w, saver)).toThrow('quota');
    expect(Object.keys(w.people!)).toEqual(['gone1', 'active', 'gone2', 'kept']);
    expect(store.get('person', 'gone1')?.cold).toBe(false);
    // Hired meanwhile, he is current again: a plain save keeps his row current.
    fail.now = false;
    w.people!['gone1']!.playing = 'released';
    w.revision++;
    saver.save(w);
    expect(store.get('person', 'gone1')?.cold).toBe(false);
  });

  it('marks nothing for a world whose people all hold a current role', () => {
    const w = tinyWorld();
    delete w.people!['gone1'];
    delete w.people!['gone2'];
    const marked: string[] = [];
    const after = moveColdPeople(w, { markCold: (_table, keys) => marked.push(...keys) });
    after();
    expect(marked).toEqual([]);
    expect(Object.keys(w.people!)).toEqual(['active', 'kept']);
  });

  it('saves a restored person back in his place, rewriting no one after him', () => {
    const w = tinyWorld();
    const store = memoryRecordStore();
    attachRecordStore(w, store);
    const saver = new RowSaver(store);
    saveMovingCold(w, saver);
    const seqs = () =>
      Object.fromEntries(
        store.rows('person').map((stored) => [stored.key, [stored.seq, stored.cold]]),
      );
    const before = seqs();
    // A write on a cold person brings him back first, at his stored place.
    restorePerson(w, 'gone2')!.playing = 'released';
    expect(Object.keys(w.people!)).toEqual(['active', 'gone2', 'kept']);
    expect(saver.save(w)).toMatchObject({ written: 1, deleted: 0 });
    expect(seqs()).toEqual({ ...before, gone2: [before['gone2']![0], false] });
  });
});

describe('player records leave memory at a save (→SAVE-32)', () => {
  const old = { moves: [{ year: 1950, day: 3, from: 'c1', to: 'c2', fee: '0' }], linked: true };
  /** The tiny world with records of a person leaving at this save, one in play and one nobody. */
  function recordsWorld() {
    const w = tinyWorld();
    w.playerRecords = structuredClone({ gone1: old, active: old, nobody: old });
    return w;
  }

  it('writes them cold in the people save, with the people leaving it counted as gone', () => {
    const store = memoryRecordStore();
    const w = attachRecordStore(recordsWorld(), store);
    const saver = new RowSaver(store);
    saver.save(w);
    const complete = worldFacts(w);
    expect(saveMovingCold(w, saver)).toMatchObject({ written: 4, deleted: 0 });
    expect(Object.keys(w.playerRecords!)).toEqual(['active']);
    expect(store.get('player_record', 'gone1')?.cold).toBe(true);
    expect(store.get('player_record', 'nobody')?.cold).toBe(true);
    expect(worldFacts(w)).toBe(complete);
    expect(Object.keys(rowsToWorld(store, { includeCold: false }).playerRecords!)).toEqual([
      'active',
    ]);
  });

  it('keeps every record when the write fails', () => {
    const fail = { now: false };
    const store = failingStore(fail);
    const w = attachRecordStore(recordsWorld(), store);
    new RowSaver(store).save(w);
    const saver = new RowSaver(store);
    saver.prime(rowsToWorld(store, { includeCold: false }));
    fail.now = true;
    expect(() => saveMovingCold(w, saver)).toThrow('quota');
    expect(Object.keys(w.playerRecords!)).toEqual(['gone1', 'active', 'nobody']);
    expect(store.get('player_record', 'nobody')?.cold).toBe(false);
  });
});

describe('own matches of earlier seasons leave memory at a save (→SAVE-32, →MATCH-5)', () => {
  const played = (id: string, year: number) => ({ id, year, home: 'c1', away: 'c2' });
  /** The tiny world in 1960 with two matches of 1959 and one of 1960. */
  function matchesWorld() {
    const w = tinyWorld();
    w.ownMatches = [played('a', 1959), played('b', 1959), played('c', 1960)] as never;
    return w;
  }

  it('writes them cold with the grown base in the one save, then drops them', () => {
    const store = memoryRecordStore();
    const w = attachRecordStore(matchesWorld(), store);
    let writes = 0;
    const counted: RecordStore = {
      ...store,
      write: (changes) => {
        writes++;
        store.write(changes);
      },
    };
    const saver = new RowSaver(counted);
    saver.save(w);
    const complete = worldFacts(w);
    writes = 0;
    saveMovingCold(w, saver);
    expect(writes).toBe(1);
    expect(w.ownMatches.map((m) => m.id)).toEqual(['c']);
    expect(w.ownMatchesBase).toBe(2);
    expect(store.get('own_match', '0')).toMatchObject({ cold: true, id: 'a' });
    expect(store.get('own_match', '1')).toMatchObject({ cold: true, id: 'b' });
    expect(store.get('own_match', '2')).toMatchObject({ cold: false, id: 'c' });
    expect(worldFacts(w)).toBe(complete);
    // The database alone opens with the base the same write committed.
    const opened = rowsToWorld(store, { includeCold: false });
    expect(opened.ownMatchesBase).toBe(2);
    expect(opened.ownMatches.map((m) => m.id)).toEqual(['c']);
    expect(rowsToWorld(store, { includeCold: true }).ownMatchesBase).toBeUndefined();
    // A later match keeps the absolute key; nothing is rewritten for the moved ones.
    w.ownMatches.push(played('d', 1960) as never);
    expect(saveMovingCold(w, saver)).toMatchObject({ written: 1, deleted: 0 });
    expect(store.get('own_match', '3')).toMatchObject({ cold: false, id: 'd' });
  });

  it('keeps every match and the base when the write fails', () => {
    const fail = { now: false };
    const store = failingStore(fail);
    const w = attachRecordStore(matchesWorld(), store);
    const saver = new RowSaver(store);
    saver.save(w);
    fail.now = true;
    expect(() => saveMovingCold(w, saver)).toThrow('quota');
    expect(w.ownMatches).toHaveLength(3);
    expect(w.ownMatchesBase).toBeUndefined();
    expect(store.get('own_match', '0')?.cold).toBe(false);
    fail.now = false;
    // The base override does not outlive the failed write: a plain save writes none.
    saver.save(w);
    expect(rowsToWorld(store, { includeCold: false }).ownMatchesBase).toBeUndefined();
  });
});

describe('events and news before last season leave memory at a save (→SAVE-32)', () => {
  const event = (year: number, kind: string) => ({ year, round: 1, kind, title: kind, detail: '' });
  const headline = (year: number, n: number) => ({
    id: `${year}:event-${n}`,
    year,
    round: 1,
    order: n,
    tag: 'club',
    tone: 'neutral',
    weight: 'minor',
    title: `t${n}`,
    sequence: n + 1,
  });
  /** The tiny world in 1960 with events and headlines of 1958, 1959 and 1960. */
  function eventsWorld() {
    const w = tinyWorld();
    w.events = [
      event(1958, 'manager-departure'),
      event(1958, 'transfer-in'),
      event(1959, 'manager-hire'),
      event(1960, 'promotion'),
    ] as never;
    w.newsJournal = {
      format: 1,
      year: 1960,
      matches: 0,
      events: 4,
      count: 4,
      peakUnbeaten: 0,
      peakWinning: 0,
      years: [1958, 1959, 1960],
      seasons: {
        1958: [headline(1958, 1), headline(1958, 0)],
        1959: [headline(1959, 2)],
        1960: [headline(1960, 3)],
      },
    } as never;
    return w;
  }

  it('writes them cold with the grown base in the one save; reads answer the same', () => {
    const store = memoryRecordStore();
    const w = attachRecordStore(eventsWorld(), store);
    const saver = new RowSaver(store);
    saver.save(w);
    const complete = worldFacts(w);
    const before = { page: newsPage(w, 0, 10), total: newsTotal(w), older: newsBefore(w) };
    saveMovingCold(w, saver);
    expect(w.events.map((e) => e.year)).toEqual([1959, 1960]);
    expect(w.eventsBase).toBe(2);
    expect(store.get('event', '1')).toMatchObject({ cold: true, kind: 'transfer-in' });
    expect(store.get('event', '2')?.cold).toBe(false);
    expect(Object.keys(w.newsJournal!.seasons)).toEqual(['1959', '1960']);
    expect(w.newsJournal!.years).toEqual([1958, 1959, 1960]);
    expect(store.get('news_bucket', '1958')?.cold).toBe(true);
    expect(worldFacts(w)).toBe(complete);
    expect(eventAt(w, 1)?.kind).toBe('transfer-in');
    expect(eventsOfKindPrefix(w, 'manager-').map(({ index }) => index)).toEqual([0, 2]);
    expect(newsPage(w, 0, 10)).toEqual(before.page);
    expect(newsTotal(w)).toBe(before.total);
    expect(newsBefore(w)).toEqual(before.older);
    expect(newsBefore(w, '1959:event-2')).toEqual(before.older.slice(2));
    // The database alone opens with the base, and validation finds the cold bucket.
    const opened = rowsToWorld(store, { includeCold: false });
    expect(opened.eventsBase).toBe(2);
    expect(opened.events).toHaveLength(2);
    // A later departure counts the cold one: the count never needs a full scan again.
    addEvent(w, 'manager-departure', 'x', 'y');
    expect(w.managerDepartures).toBe(2);
    expect(saveMovingCold(w, saver)).toMatchObject({ deleted: 0 });
    expect(store.get('event', '4')).toMatchObject({ cold: false, kind: 'manager-departure' });
  });

  it('keeps every event, headline and the base when the write fails', () => {
    const fail = { now: false };
    const store = failingStore(fail);
    const w = attachRecordStore(eventsWorld(), store);
    const saver = new RowSaver(store);
    saver.save(w);
    fail.now = true;
    expect(() => saveMovingCold(w, saver)).toThrow('quota');
    expect(w.events).toHaveLength(4);
    expect(w.eventsBase).toBeUndefined();
    expect(Object.keys(w.newsJournal!.seasons)).toHaveLength(3);
    expect(store.get('event', '0')?.cold).toBe(false);
    expect(store.get('news_bucket', '1958')?.cold).toBe(false);
  });
});

describe('season archives older than seven seasons leave memory at a save (→SAVE-32, →HIST-2)', () => {
  /** A synthetic archive with standings, a continental table, a bracket and scorers; not playable. */
  const archive = (year: number) => ({
    year,
    tier: 1,
    group: 0,
    rank: 2,
    champions: [{ country: 'ENG', club: 'c1', cup: 'c2' }],
    standings: [[0, 1, 0, 50]],
    europe: [{ kind: 'ucl', name: 'Cup', winner: 'c1', standings: [[0, 3]] }],
    brackets: [{ competition: 'cup', rounds: [] }],
    scorers: [{ name: 'n', goals: 9 }],
  });
  /** Ten seasons archived, 1950–1959, the current season 1960. */
  function archivesWorld() {
    const w = tinyWorld();
    w.people = {};
    w.history = Array.from({ length: 10 }, (_, i) => archive(1950 + i)) as never;
    return w;
  }

  it('writes the oldest cold with the grown base in the one save; every read answers the same', () => {
    const store = memoryRecordStore();
    const w = attachRecordStore(archivesWorld(), store);
    const saver = new RowSaver(store);
    saver.save(w);
    const complete = worldFacts(w);
    const summaries = archiveSummaries(w);
    expect(summaries[0]).not.toHaveProperty('brackets');
    expect(summaries[0]!.standings).toEqual([]);
    expect(coldArchiveCount(w)).toBe(3);
    saveMovingCold(w, saver);
    expect(w.history.map((h) => h.year)).toEqual([1953, 1954, 1955, 1956, 1957, 1958, 1959]);
    expect(w.historyBase).toBe(3);
    expect(store.get('season_archive', '1952')).toMatchObject({ cold: true, seq: 2 });
    expect(store.get('season_archive', '1953')?.cold).toBe(false);
    expect(worldFacts(w)).toBe(complete);
    // The view's season list is identical before and after the move.
    expect(archiveSummaries(w)).toEqual(summaries);
    expect(JSON.stringify(archiveSummaries(w))).toBe(JSON.stringify(summaries));
    expect(archiveCount(w)).toBe(10);
    expect(archiveYears(w)).toEqual(summaries.map((h) => h.year));
    expect(archiveOf(w, 1951)).toEqual(archive(1951));
    expect(archiveOf(w, 1958)).toEqual(archive(1958));
    expect(archiveOf(w, 1940)).toBeUndefined();
    expect(archiveAt(w, 0)).toEqual(archive(1950));
    expect(archiveAt(w, 9)?.year).toBe(1959);
    // The database alone opens with the base; a second save moves nothing more.
    const opened = rowsToWorld(store, { includeCold: false });
    expect(opened.historyBase).toBe(3);
    expect(opened.history).toHaveLength(7);
    expect(saveMovingCold(w, saver)).toMatchObject({ written: 0, deleted: 0 });
  });

  it('keeps the last seven archives in memory across the war gap', () => {
    const w = archivesWorld();
    w.history = [1932, 1933, 1934, 1935, 1936, 1937, 1938].map(archive) as never;
    w.year = 1946;
    expect(coldArchiveCount(w)).toBe(0);
    w.history.unshift(archive(1931) as never);
    expect(coldArchiveCount(w)).toBe(1);
  });

  it('keeps every archive and the base when the write fails', () => {
    const fail = { now: false };
    const store = failingStore(fail);
    const w = attachRecordStore(archivesWorld(), store);
    const saver = new RowSaver(store);
    saver.save(w);
    fail.now = true;
    expect(() => saveMovingCold(w, saver)).toThrow('quota');
    expect(w.history).toHaveLength(10);
    expect(w.historyBase).toBeUndefined();
    expect(store.get('season_archive', '1950')?.cold).toBe(false);
  });
});
