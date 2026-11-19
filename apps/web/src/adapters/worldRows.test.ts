import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import {
  attachRecordStore,
  type RecordChanges,
  type RecordStore,
} from '../../../../packages/contracts/src/record-store';
import type { World } from '../../../../packages/contracts/src/types';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { RowSaver } from './rowSaver';
import { SAVE_SCHEMA_VERSION } from './saveSchema';
import { rowsToWorld, worldFacts, worldToRows } from './worldRows';

/** A synthetic world holding one of every row family; not a playable world. */
function tinyWorld() {
  return {
    schema: 1,
    engine: '0.9.0',
    catalog: 'test-catalog',
    catalogHash: 'h1',
    id: 'world-1',
    revision: 4,
    playerClub: 'c1',
    people: { z9: { name: 'Z' }, a1: { name: 'A' }, m5: { name: 'M' } },
    squads: { c2: [{ id: 'p2' }] },
    playerRecords: {},
    ownMatches: [
      { id: 'f1', year: 1950, home: 'c1', away: 'c2' },
      { id: 'f2', year: 1950, home: 'c3', away: 'c1' },
    ],
    history: [{ year: 1950, rank: 3 }],
    events: [{ year: 1950, round: 1, kind: 'sale', title: 't', detail: 'd' }],
    newsJournal: { format: 1, year: 1951, seasons: { '1951': [{ id: 'n2' }], '1950': [] } },
    kitChoice: { fixture: 'f9' },
    cash: '100',
  } as unknown as World & Record<string, unknown>;
}

const reload = (store: RecordStore, includeCold = true) => rowsToWorld(store, { includeCold });

describe('world rows', () => {
  it('round-trips a world with its record key order and index columns', () => {
    const w = tinyWorld();
    const store = memoryRecordStore();
    new RowSaver(store).save(w);
    const back = reload(store);
    expect(canonical(back)).toBe(canonical(w));
    expect(Object.keys(back.people!)).toEqual(['z9', 'a1', 'm5']);
    expect(Object.keys(back)).toEqual(Object.keys(w));
    expect(store.get('own_match', '1')).toMatchObject({ id: 'f2', year: 1950, opponent: 'c3' });
    expect(store.get('season_archive', '1950')).toMatchObject({ year: 1950, seq: 0 });
    expect(store.get('event', '0')).toMatchObject({ year: 1950, kind: 'sale' });
    expect(store.get('news_bucket', '1951')).toMatchObject({ year: 1951 });
  });

  it('indexes array rows by absolute position when a base is present', () => {
    const w = { ...tinyWorld(), eventsBase: 40 } as unknown as World;
    const keys = worldToRows(w)
      .filter((row) => row.table === 'event')
      .map((row) => [row.key, row.seq]);
    expect(keys).toEqual([['40', 40]]);
  });

  it('writes every row first, then only changed rows, and rewrites the metadata', () => {
    const w = tinyWorld();
    const store = memoryRecordStore();
    const saver = new RowSaver(store);
    const first = saver.save(w);
    expect(first.written).toBe(first.rows);
    expect(first.deleted).toBe(0);
    (w.people as Record<string, { name: string }>)['a1']!.name = 'A2';
    w.revision = 5;
    expect(saver.save(w)).toMatchObject({ written: 2, deleted: 0 }); // the person and revision
    expect(store.meta()).toEqual({
      schema_version: String(SAVE_SCHEMA_VERSION),
      engine: '0.9.0',
      catalog: 'test-catalog',
      catalog_hash: 'h1',
      world_id: 'world-1',
      revision: '5',
    });
    expect(canonical(reload(store))).toBe(canonical(w));
  });

  it('deletes an undefined field and a removed record without rewriting later records', () => {
    const w = tinyWorld();
    const store = memoryRecordStore();
    const saver = new RowSaver(store);
    saver.save(w);
    w['kitChoice'] = undefined;
    delete (w.people as Record<string, unknown>)['z9'];
    expect(saver.save(w)).toMatchObject({ written: 0, deleted: 2 });
    expect(store.has('world_field', 'kitChoice')).toBe(false);
    expect(store.has('person', 'z9')).toBe(false);
    expect(canonical(reload(store))).toBe(canonical(w));
    (w.people as Record<string, unknown>)['z9'] = { name: 'Z again' };
    expect(saver.save(w)).toMatchObject({ written: 1, deleted: 0 });
    expect(Object.keys(reload(store).people!)).toEqual(['a1', 'm5', 'z9']);
  });

  it('keeps cold rows when their records leave memory', () => {
    const w = tinyWorld();
    const store = memoryRecordStore();
    attachRecordStore(w, store);
    const saver = new RowSaver(store);
    saver.save(w);
    const complete = canonical(w);
    saver.markCold('person', ['a1']);
    delete (w.people as Record<string, unknown>)['a1'];
    expect(saver.save(w)).toMatchObject({ written: 1, deleted: 0 });
    expect(store.get('person', 'a1')?.cold).toBe(true);
    expect(Object.keys(reload(store, false).people!)).toEqual(['z9', 'm5']);
    expect(canonical(reload(store))).toBe(complete);
    expect(worldFacts(w)).toBe(complete);
    // A later save never deletes it.
    expect(saver.save(w)).toMatchObject({ written: 0, deleted: 0 });
    expect(store.has('person', 'a1')).toBe(true);
  });

  it('writes the same changes again after a failed write', () => {
    const w = tinyWorld();
    const inner = memoryRecordStore();
    let fail = false;
    const store: RecordStore = {
      ...inner,
      write(changes: RecordChanges) {
        if (fail) throw new Error('quota');
        inner.write(changes);
      },
    };
    const saver = new RowSaver(store);
    saver.save(w);
    w.cash = '200';
    fail = true;
    expect(() => saver.save(w)).toThrow('quota');
    fail = false;
    expect(saver.save(w)).toMatchObject({ written: 1 });
    expect(canonical(reload(inner))).toBe(canonical(w));
  });
});
