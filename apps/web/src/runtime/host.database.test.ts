import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import type { RecordChanges, RecordStore } from '../../../../packages/contracts/src/record-store';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { Host, type GameFiles, type OpenStore } from './host';
import { req, startedHost } from './host.testkit';

/**
 * Game databases kept across hosts, as files outlive a page: `close` only marks the store closed,
 * each write's put count is recorded and `failNext` fails the next write before it touches a row.
 */
function databases() {
  const files = new Map<string, RecordStore>();
  const puts: number[] = [];
  let failNext = false;
  const wrap = (inner: RecordStore): RecordStore => ({
    ...inner,
    write(changes: RecordChanges) {
      if (failNext) {
        failNext = false;
        throw new Error('QuotaExceededError');
      }
      inner.write(changes);
      puts.push(changes.put.length);
    },
    close() {},
  });
  const openStore: OpenStore = (gameId, { create }) => {
    let store = files.get(gameId);
    if (!store && create) files.set(gameId, (store = wrap(memoryRecordStore())));
    return store;
  };
  const gameFiles: GameFiles = {
    list: () => [...files.keys()],
    remove: (gameId) => void files.delete(gameId),
  };
  return { files, puts, openStore, gameFiles, failWrite: () => (failNext = true) };
}

describe('the game in play in its database (→SAVE-2/3, →ARCH-6/13)', () => {
  it('creates the game whole, saves changed rows only and reopens the same world', async () => {
    const db = databases();
    const { host } = await startedHost(undefined, {}, new Host(undefined, db));
    const revision = host.world!.revision;
    const created = await host.handle(
      req('create', revision, { type: 'create-game', gameId: 'g1' }),
    );
    expect(created.ok, created.error).toBe(true);
    expect(created.saved).toEqual({ gameId: 'g1', worldId: host.world!.id, revision });
    const rows = db.puts[0];
    expect(rows).toBeGreaterThan(100);
    // A second create of the same game never overwrites it unless asked to replace it.
    expect(
      (await host.handle(req('again', revision, { type: 'create-game', gameId: 'g1' }))).ok,
    ).toBe(false);
    expect(db.puts).toHaveLength(1);
    const recreated = await host.handle(
      req('replace', revision, { type: 'create-game', gameId: 'g1', replace: true }),
    );
    expect(recreated.ok, recreated.error).toBe(true);
    expect(db.puts.at(-1)).toBe(0);

    // The first day after a takeover opens the season's business for every club (measured on
    // this world: 420 of 2,504 rows); an ordinary day after it changes a handful.
    for (const day of ['opening', 'day']) {
      const played = await host.handle(
        req(day, host.world!.revision, {
          type: 'command',
          command: { type: 'advance-days', days: 1 },
        }),
      );
      expect(played.ok, played.error).toBe(true);
      expect((await host.handle(req(`save-${day}`, -1, { type: 'save' }))).ok).toBe(true);
    }
    const saved = await host.handle(req('save', -1, { type: 'save' }));
    expect(saved.ok, saved.error).toBe(true);
    expect(saved.saved?.revision).toBe(host.world!.revision);
    expect(db.puts.at(-2)).toBeLessThan(rows / 10);
    // Saving again with nothing changed writes no row.
    expect(db.puts.at(-1)).toBe(0);

    const reopened = new Host(undefined, db);
    const opened = await reopened.handle(req('open', -1, { type: 'open-game', gameId: 'g1' }));
    expect(opened.ok, opened.error).toBe(true);
    expect(opened.opened).toEqual({ gameId: 'g1', found: true, revision: host.world!.revision });
    expect(opened.upgraded).toBeUndefined();
    expect(canonical(reopened.world)).toBe(canonical(host.world));
    // Primed with what it opened, the next save writes nothing but its metadata.
    expect((await reopened.handle(req('resave', -1, { type: 'save' }))).ok).toBe(true);
    expect(db.puts.at(-1)).toBe(0);
  });

  it('reads a game without a database as an empty slot and refuses an unsupported one untouched', async () => {
    const db = databases();
    const host = new Host(undefined, db);
    const missing = await host.handle(req('missing', -1, { type: 'open-game', gameId: 'none' }));
    expect(missing.ok).toBe(true);
    expect(missing.opened).toEqual({ gameId: 'none', found: false });
    expect(host.world).toBeUndefined();

    const { host: writer } = await startedHost(undefined, {}, new Host(undefined, db));
    await writer.handle(
      req('create', writer.world!.revision, { type: 'create-game', gameId: 'g' }),
    );
    const store = db.files.get('g')!;
    store.write({ put: [], delete: [], meta: { engine: '99.0.0' } });
    const before = JSON.stringify([
      store.meta(),
      store.count('person'),
      store.count('world_field'),
    ]);
    const newer = await host.handle(req('newer', -1, { type: 'open-game', gameId: 'g' }));
    expect(newer.ok).toBe(false);
    expect(newer.errorCode).toBe('save-compatibility');
    expect(host.world).toBeUndefined();
    expect(JSON.stringify([store.meta(), store.count('person'), store.count('world_field')])).toBe(
      before,
    );
  });

  it('never acknowledges a failed write and writes the same changes on the next save', async () => {
    const db = databases();
    const { host } = await startedHost(undefined, {}, new Host(undefined, db));
    await host.handle(req('create', host.world!.revision, { type: 'create-game', gameId: 'g' }));
    await host.handle(
      req('day', host.world!.revision, {
        type: 'command',
        command: { type: 'advance-days', days: 1 },
      }),
    );
    db.failWrite();
    const failed = await host.handle(req('fail', -1, { type: 'save' }));
    expect(failed.ok).toBe(false);
    expect(failed.saved).toBeUndefined();
    expect(Number(db.files.get('g')!.meta().revision)).toBeLessThan(host.world!.revision);
    const retried = await host.handle(req('retry', -1, { type: 'save' }));
    expect(retried.ok, retried.error).toBe(true);
    expect(db.puts.at(-1)).toBeGreaterThan(0);
    const reopened = new Host(undefined, db);
    await reopened.handle(req('open', -1, { type: 'open-game', gameId: 'g' }));
    expect(canonical(reopened.world)).toBe(canonical(host.world));
  });

  it('closes the game in play, lists the files and deletes a game with its file (→SAVE-14/29)', async () => {
    const db = databases();
    const { host } = await startedHost(undefined, {}, new Host(undefined, db));
    await host.handle(req('create', host.world!.revision, { type: 'create-game', gameId: 'a' }));
    expect((await host.handle(req('close', -1, { type: 'close-game' }))).ok).toBe(true);
    expect(host.world).toBeUndefined();
    // Closed, nothing is in play to save.
    expect((await host.handle(req('save', -1, { type: 'save' }))).ok).toBe(false);
    expect((await host.handle(req('list', -1, { type: 'list-games' }))).games).toEqual(['a']);
    // The closed file opens again as it was saved.
    const reopened = await host.handle(req('open', -1, { type: 'open-game', gameId: 'a' }));
    expect(reopened.opened?.found).toBe(true);
    // Deleting the game in play releases it and removes the file; a file never made is no error.
    expect((await host.handle(req('delete', -1, { type: 'delete-game', gameId: 'a' }))).ok).toBe(
      true,
    );
    expect(host.world).toBeUndefined();
    expect(db.files.has('a')).toBe(false);
    expect((await host.handle(req('none', -1, { type: 'delete-game', gameId: 'a' }))).ok).toBe(
      true,
    );
    expect((await host.handle(req('empty', -1, { type: 'list-games' }))).games).toEqual([]);
    const bad = await host.handle(req('bad', -1, { type: 'delete-game', gameId: '../x' }));
    expect(bad.ok).toBe(false);
  });
});
