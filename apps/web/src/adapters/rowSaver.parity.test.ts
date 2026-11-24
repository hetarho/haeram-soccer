/**
 * T1061-save-parity: a saver told which world fields changed (`RowSaver.touch`) leaves the same
 * database as the full comparison of every row (→SAVE-3), save after save — first save, reopen,
 * a stop, owner decisions, in-place updates, removals, cold moves and reactivation, a failed write
 * and its retry — down to the serialized database bytes.
 */
import { describe, expect, it } from 'vitest';
import type { RecordChanges, RecordStore } from '../../../../packages/contracts/src/record-store';
import type { World } from '../../../../packages/contracts/src/types';
import { nodeSqliteDriver, type SerializableDriver } from '../../../../tests/fixtures/node-sqlite';
import { RowSaver } from './rowSaver';
import { sqlRecordStore } from './sqlRecordStore';
import { WORLD_TABLES, rowsToWorld } from './worldRows';

type Fields = Record<string, unknown>;

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
    ticket: 0.05,
    people: { z9: { name: 'Z' }, a1: { name: 'A' }, m5: { name: 'M' } },
    squads: { c2: [{ id: 'p2', fatigue: 10 }], c3: [{ id: 'p3', fatigue: 0 }] },
    playerRecords: { p2: { apps: 1 } },
    ownMatches: [
      { id: 'f1', year: 1950, home: 'c1', away: 'c2' },
      { id: 'f2', year: 1951, home: 'c3', away: 'c1' },
    ],
    history: [{ year: 1950, rank: 3 }],
    events: [{ year: 1950, round: 1, kind: 'sale', title: 't', detail: 'd' }],
    newsJournal: { format: 1, year: 1951, seasons: { '1951': [{ id: 'n2' }], '1950': [] } },
    cash: '100',
  } as unknown as World & Fields;
}

/** A game database whose writes can be made to fail, as a full disk does. */
function game(bytes?: Uint8Array) {
  const driver: SerializableDriver = nodeSqliteDriver(':memory:', bytes);
  const inner = sqlRecordStore(driver);
  const state = { fail: false };
  const store: RecordStore = {
    ...inner,
    write(changes: RecordChanges) {
      if (state.fail) throw new Error('quota');
      inner.write(changes);
    },
  };
  return { driver, store, state };
}

/** Every row and the metadata of a database. */
const contents = (store: RecordStore) => ({
  meta: store.meta(),
  rows: WORLD_TABLES.map((table) => store.rows(table)),
});

/**
 * Two careers played alike: both savers are tracked, one told what each step changed (`touch`),
 * the other told everything changed, so it compares every row at every save as before T1061.
 */
function pair() {
  const sides = [game(), game()].map((g) => ({
    ...g,
    w: tinyWorld(),
    saver: new RowSaver(g.store, { tracked: true }),
  }));
  const [tracked, full] = sides as [(typeof sides)[number], (typeof sides)[number]];
  /** One step on both worlds, then a save; `changed` is what the tracked side is told. */
  const step = (change: (w: Fields) => void, changed: readonly string[] | 'all') => {
    for (const side of sides) change(side.w as Fields);
    tracked.saver.touch(changed);
    full.saver.touch('all');
    const stats = sides.map((side) => side.saver.save(side.w));
    expect(stats[0]).toEqual(stats[1]);
    expect(contents(tracked.store)).toEqual(contents(full.store));
    expect(tracked.driver.serialize()).toEqual(full.driver.serialize());
    return stats[0]!;
  };
  /** Both games closed and opened again from their bytes, each saver primed from its rows. */
  const reopen = () => {
    for (const side of sides) {
      const again = game(side.driver.serialize());
      Object.assign(side, again, {
        w: rowsToWorld(again.store, { includeCold: false }),
        saver: new RowSaver(again.store, { tracked: true }),
      });
      side.saver.prime(side.w);
    }
    expect(tracked.w).toEqual(full.w);
  };
  return { tracked, full, sides, step, reopen };
}

const people = (w: Fields) => w.people as Fields;

describe('T1061-save-parity', () => {
  it('writes the database the full comparison writes, save after save', () => {
    const { tracked, full, sides, step, reopen } = pair();
    step(() => {}, 'all');
    reopen();
    step(() => {}, []);
    // A stop: days may have changed anything, in place too.
    step((w) => {
      ((w.squads as Record<string, Fields[]>).c2![0]!.fatigue as number) += 5;
      people(w).m5 = { name: 'M', club: 'c2' };
      (w.ownMatches as Fields[]).push({ id: 'f3', year: 1951, home: 'c1', away: 'c3' });
      w.revision = 5;
    }, 'all');
    // An owner decision: its setting and its event, the read models and the revision.
    step(
      (w) => {
        w.ticket = 0.08;
        (w.events as Fields[]).push({ year: 1951, round: 2, kind: 'club-ticket', title: 'x' });
        (w.newsJournal as { seasons: Record<string, Fields[]> }).seasons['1951']!.push({
          id: 'n3',
        });
        w.revision = 6;
      },
      ['ticket', 'events', 'newsJournal', 'revision'],
    );
    // In-place updates and removals inside the fields a step names.
    step(
      (w) => {
        (people(w).z9 as Fields).name = 'Zed';
        delete people(w).m5;
        delete (w.squads as Fields).c3;
        delete w.cash;
      },
      ['people', 'squads', 'cash'],
    );
    // Cold moves (→SAVE-32): a person and the first own match leave memory once the save commits,
    // the base counting the match set in the same write.
    for (const side of sides) {
      side.saver.markCold('person', ['a1']);
      side.saver.markCold('own_match', ['0']);
      side.saver.setField('ownMatchesBase', 1);
    }
    step(() => {}, []);
    for (const side of sides) {
      delete people(side.w).a1;
      side.w.ownMatches = side.w.ownMatches.slice(1);
      (side.w as Fields).ownMatchesBase = 1;
    }
    step(() => {}, []);
    // A retired person hired again comes back from his cold row.
    step(
      (w) => {
        people(w).a1 = { name: 'A', club: 'c1' };
      },
      ['people'],
    );
    reopen();
    // A failed write leaves the last commit; its retry writes everything since, with a later
    // decision's change.
    for (const side of sides) side.state.fail = true;
    const before = contents(tracked.store);
    for (const side of sides) {
      side.w.ticket = 0.02;
      side.saver.touch(['ticket']);
      expect(() => side.saver.save(side.w)).toThrow('quota');
    }
    expect(contents(tracked.store)).toEqual(before);
    for (const side of sides) side.state.fail = false;
    expect(
      step(
        (w) => {
          (w.history as Fields[]).push({ year: 1951, rank: 1 });
        },
        ['history'],
      ),
    ).toMatchObject({ written: 2 });
    expect(tracked.store.get('world_field', 'ticket')?.data).toBe('0.02');
    reopen();
    expect(contents(tracked.store)).toEqual(contents(full.store));
    expect(rowsToWorld(tracked.store, { includeCold: true })).toEqual(
      rowsToWorld(full.store, { includeCold: true }),
    );
  });

  it('keeps the committed text of a field no step named', () => {
    const { tracked, step } = pair();
    step(() => {}, 'all');
    // Told nothing changed, the saver does not encode the squads again: a change it is not told
    // of is not written, which is why every unaudited step touches everything.
    (tracked.w as Fields).cash = '300';
    tracked.saver.touch([]);
    expect(tracked.saver.save(tracked.w)).toMatchObject({ written: 0 });
    tracked.saver.touch(['cash']);
    expect(tracked.saver.save(tracked.w)).toMatchObject({ written: 1 });
  });
});
