import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../../../../packages/contracts/src/record-store';
import type { World } from '../../../../packages/contracts/src/types';
import { linkPlayer, playerRecord } from '../../../../packages/engine/src/player-records';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { WORLD_TABLES, worldToRows } from '../adapters/worldRows';
import { Host, type OpenStore } from './host';
import { req, startedHost } from './host.testkit';

/**
 * T1065: the game's save writes the rows a full comparison of the world would write, whatever the
 * request before it changed (→SAVE-3). Both cases are the two ways an earlier save that reused
 * committed row text left stale rows (b2b0b80ef, reverted before release).
 */

/** A host over one in-memory game database per game, kept across saves. */
function gameHost() {
  const files = new Map<string, RecordStore>();
  const openStore: OpenStore = (gameId, { create }) => {
    let store = files.get(gameId);
    if (!store && create) files.set(gameId, (store = memoryRecordStore()));
    return store;
  };
  const host = new Host(undefined, {
    openStore,
    gameFiles: { list: () => [...files.keys()], remove: (gameId) => void files.delete(gameId) },
  });
  return { files, host };
}

/** Each in-memory row of the store's tables, by table and key, as its text. */
function storedRows(store: RecordStore): Map<string, string> {
  const rows = new Map<string, string>();
  for (const table of WORLD_TABLES)
    for (const stored of store.rows(table, { cold: false }))
      rows.set(`${table}/${stored.key}`, stored.data);
  return rows;
}

/** Each row of `w` as a full comparison writes it, by table and key. */
function worldRows(w: World): Map<string, string> {
  return new Map(worldToRows(w).map((stored) => [`${stored.table}/${stored.key}`, stored.data]));
}

const save = async (host: Host, id: string) => {
  const reply = await host.handle(req(id, -1, { type: 'save' }));
  expect(reply.ok, reply.error).toBe(true);
};

describe('a save writes what a full comparison writes (→SAVE-3, T1065)', () => {
  it('writes a record an owner decision changes beside its own setting', async () => {
    const { files, host } = gameHost();
    await startedHost(undefined, {}, host);
    const w = host.world!;
    // A squad player's record, so no save moves it out of memory (→SAVE-32), unlinked when first
    // committed.
    const id = Object.values(w.squads!)[0]![0]!.id;
    playerRecord(w, id);
    const created = await host.handle(
      req('create', w.revision, { type: 'create-game', gameId: 'g' }),
    );
    expect(created.ok, created.error).toBe(true);
    await save(host, 'save-1');
    expect(JSON.parse(files.get('g')!.get('player_record', id)!.data).linked).toBe(false);

    // A ticket decision whose request also links a retained player, as its news refresh does for
    // a previous season's Ballon d'Or podium (linkPlayer is that writer).
    linkPlayer(host.world!, id);
    const decided = await host.handle(
      req('ticket', host.world!.revision, {
        type: 'command',
        command: { type: 'club-ticket', price: 0.08 },
      }),
    );
    expect(decided.ok, decided.error).toBe(true);
    await save(host, 'save-2');

    const store = files.get('g')!;
    expect(JSON.parse(store.get('player_record', id)!.data).linked).toBe(true);
    expect(storedRows(store)).toEqual(worldRows(host.world!));
  });

  it("keeps each season archive's own row when the base runs past the archives' years", async () => {
    const { files, host } = gameHost();
    await startedHost(undefined, {}, host);
    const w = host.world!;
    // Archives keyed by their season: a base of 1949 puts the 1948 archive at absolute index 1949,
    // the 1949 archive's key. Two archives stay in memory (→SAVE-32).
    const [model] = w.history.length ? w.history : [{ year: 0 } as World['history'][number]];
    w.history = [1948, 1949].map((year) => ({ ...structuredClone(model!), year }));
    w.historyBase = 1949;
    const created = await host.handle(
      req('create', w.revision, { type: 'create-game', gameId: 'g' }),
    );
    expect(created.ok, created.error).toBe(true);
    await save(host, 'save-1');
    await save(host, 'save-2');

    const store = files.get('g')!;
    for (const year of [1948, 1949])
      expect(JSON.parse(store.get('season_archive', String(year))!.data).year).toBe(year);
    expect(storedRows(store)).toEqual(worldRows(host.world!));
  });
});
