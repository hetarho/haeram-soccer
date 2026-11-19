import { beforeAll, describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import type { RecordChanges, RecordStore } from '../../../../packages/contracts/src/record-store';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { memoryGames } from '../../../../tests/fixtures/save-file';
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { decodeSaveFile, encodeSaveFile, SAVE_FILE_MAGIC } from '../adapters/saveFile';
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

/** A host over in-memory database files that also export and import them as bytes. */
const fileHost = (files = memoryGames()) => ({
  files,
  host: new Host(undefined, {
    openStore: files.open,
    gameFiles: { list: files.list, remove: files.remove },
    databaseBytes: files.bytes,
  }),
});
const sameWorld = (a: Host, b: Host) => canonical(a.world) === canonical(b.world);
/**
 * Byte equality of two database images. `toEqual` walks a multi-megabyte array element by element,
 * which alone took minutes here.
 */
const sameBytes = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));
/** Imports parse and validate a whole world: slow on a loaded machine. */
const SLOW = 300_000;
const failure = (reply: { ok: boolean; error?: string }) => reply.error ?? '';

describe('the portable save file (→SAVE-9, →ARCH-16)', () => {
  // One generated career, three days in, saved and exported; every test imports its file.
  let source: Host;
  let file: Uint8Array;
  beforeAll(async () => {
    ({ host: source } = await startedHost(undefined, {}, fileHost().host));
    await source.handle(
      req('create', source.world!.revision, { type: 'create-game', gameId: 'g1' }),
    );
    await source.handle(
      req('day', source.world!.revision, {
        type: 'command',
        command: { type: 'advance-days', days: 3 },
      }),
    );
    await source.handle(req('save', -1, { type: 'save' }));
    const exported = await source.handle(req('export', -1, { type: 'export-game', gameId: 'g1' }));
    expect(exported.ok, exported.error).toBe(true);
    file = exported.file!;
  }, SLOW);
  /** A host holding the career's file as the game `gameId`, in play. */
  const imported = async (files = memoryGames(), gameId = 'copy') => {
    const target = fileHost(files);
    const reply = await target.host.handle(
      req(`import-${gameId}`, -1, { type: 'import-game', gameId, file }),
    );
    expect(reply.ok, reply.error).toBe(true);
    return { ...target, reply };
  };

  it(
    'exports the game as a file and imports it into another browser as the same world',
    async () => {
      expect(new TextDecoder().decode(file.subarray(0, SAVE_FILE_MAGIC.length))).toBe(
        SAVE_FILE_MAGIC,
      );
      const { header } = await decodeSaveFile(file);
      expect(header).toMatchObject({
        format: 'sqlite-1',
        schema: 1,
        engine: source.world!.engine,
        catalog: source.world!.catalog,
        catalogHash: source.world!.catalogHash,
        worldId: source.world!.id,
      });
      const other = await imported();
      expect(other.reply.opened).toEqual({
        gameId: 'copy',
        found: true,
        revision: source.world!.revision,
      });
      expect(other.reply.upgraded).toBeUndefined();
      expect(sameWorld(other.host, source)).toBe(true);
      expect(other.files.list()).toEqual(['copy']);
      // The imported file is a whole game: it saves, closes and opens again like any other.
      expect((await other.host.handle(req('resave', -1, { type: 'save' }))).ok).toBe(true);
      const reopened = fileHost(other.files);
      await reopened.host.handle(req('open', -1, { type: 'open-game', gameId: 'copy' }));
      expect(sameWorld(reopened.host, source)).toBe(true);
    },
    SLOW,
  );

  it(
    'exports a game that is not in play as last saved, even one this version cannot open',
    async () => {
      const { files, host } = await imported(memoryGames(), 'old');
      await host.handle(req('close', -1, { type: 'close-game' }));
      files.games.get('old')!.game.store.write({ put: [], delete: [], meta: { engine: '99.0.0' } });
      const reader = fileHost(files).host;
      const exported = await reader.handle(
        req('export', -1, { type: 'export-game', gameId: 'old' }),
      );
      expect(exported.ok, exported.error).toBe(true);
      expect((await decodeSaveFile(exported.file!)).header.engine).toBe('99.0.0');
      // A game without a file has nothing to export.
      expect((await reader.handle(req('none', -1, { type: 'export-game', gameId: 'no' }))).ok).toBe(
        false,
      );
    },
    SLOW,
  );

  it(
    'exports the game in play from memory when its save failed, its committed file untouched (→SAVE-3/10)',
    async () => {
      let failing = false;
      const files = memoryGames({
        wrap: ({ store }) => ({
          ...store,
          write(changes) {
            if (failing) throw new Error('QuotaExceededError');
            store.write(changes);
          },
        }),
      });
      const { host } = await imported(files);
      const committed = files.games.get('copy')!.game.driver.serialize();
      await host.handle(
        req('day', host.world!.revision, {
          type: 'command',
          command: { type: 'advance-days', days: 2 },
        }),
      );
      failing = true;
      expect((await host.handle(req('save', -1, { type: 'save' }))).ok).toBe(false);
      const reply = await host.handle(
        req('export', -1, { type: 'export-game', gameId: 'copy', memory: true }),
      );
      expect(reply.ok, reply.error).toBe(true);
      // The file holds the world as it stands in memory; the committed file is as it was.
      expect(sameBytes(files.games.get('copy')!.game.driver.serialize(), committed)).toBe(true);
      const other = fileHost();
      const again = await other.host.handle(
        req('import', -1, { type: 'import-game', gameId: 'again', file: reply.file! }),
      );
      expect(again.ok, again.error).toBe(true);
      expect(other.host.world!.revision).toBe(host.world!.revision);
      expect(sameWorld(other.host, host)).toBe(true);
    },
    SLOW,
  );

  it(
    'refuses a file that fails any check and leaves every game and the game in play untouched',
    async () => {
      const files = memoryGames();
      const { host } = await imported(files, 'mine');
      const before = canonical(host.world);
      const rows = files.games.get('mine')!.game.driver.serialize();
      const { header, dbBytes } = await decodeSaveFile(file);
      const meta = {
        schema: header.schema,
        engine: header.engine,
        catalog: header.catalog,
        catalogHash: header.catalogHash,
        worldId: header.worldId,
      };
      // SQLite's own 16-byte magic overwritten: the checksum covers the damage, SQLite refuses it.
      const damaged = new Uint8Array(dbBytes);
      damaged.fill(0x41, 0, 16);
      const refused: [string, Uint8Array][] = [
        // Not a save file: the JSON envelope of an earlier release.
        ['envelope', new TextEncoder().encode(JSON.stringify({ schema: 5, payload: 'x' }))],
        ['truncated', file.subarray(0, file.length >> 1)],
        // Bytes that are no SQLite database, behind a header and checksum that agree.
        ['not sqlite', await encodeSaveFile(meta, new TextEncoder().encode('not a database'))],
        ['damaged', await encodeSaveFile(meta, damaged)],
        // A header naming another world than the database holds.
        ['other world', await encodeSaveFile({ ...meta, worldId: 'someone else' }, dbBytes)],
      ];
      for (const [name, bad] of refused) {
        const reply = await host.handle(
          req(`bad-${name}`, -1, {
            type: 'import-game',
            gameId: 'incoming',
            replaces: 'mine',
            file: bad,
          }),
        );
        expect(reply.ok, name).toBe(false);
        expect(files.list(), name).toEqual(['mine']);
        expect(canonical(host.world), name).toBe(before);
        expect(sameBytes(files.games.get('mine')!.game.driver.serialize(), rows), name).toBe(true);
      }
      // The game in play still saves.
      expect((await host.handle(req('save', -1, { type: 'save' }))).ok).toBe(true);
    },
    SLOW,
  );

  it(
    'refuses a file of another rules version or schema as a compatibility failure',
    async () => {
      const { files, host } = await imported(memoryGames(), 'src');
      const source = files.games.get('src')!.game;
      source.store.write({ put: [], delete: [], meta: { engine: '99.0.0' } });
      const newer = (await host.handle(req('x', -1, { type: 'export-game', gameId: 'src' }))).file!;
      expect((await decodeSaveFile(newer)).header.engine).toBe('99.0.0');
      const target = fileHost();
      const reply = await target.host.handle(
        req('import', -1, { type: 'import-game', gameId: 'incoming', file: newer }),
      );
      expect(reply.ok).toBe(false);
      expect(reply.errorCode).toBe('save-compatibility');
      expect(target.files.list()).toEqual([]);
      expect(target.host.world).toBeUndefined();
      // A schema this version does not know: refused before the world is read.
      source.store.write({ put: [], delete: [], meta: { engine: host.world!.engine } });
      source.driver.exec('PRAGMA user_version = 2');
      const schema = (await host.handle(req('y', -1, { type: 'export-game', gameId: 'src' })))
        .file!;
      const refused = await target.host.handle(
        req('import2', -1, { type: 'import-game', gameId: 'incoming', file: schema }),
      );
      expect(refused.ok).toBe(false);
      expect(refused.errorCode).toBe('save-compatibility');
      expect(target.files.list()).toEqual([]);
    },
    SLOW,
  );

  it(
    'replaces the slot game only once the import is in place',
    async () => {
      const files = memoryGames();
      await imported(files, 'old');
      const target = fileHost(files);
      const reply = await target.host.handle(
        req('import', -1, { type: 'import-game', gameId: 'new', replaces: 'old', file }),
      );
      expect(reply.ok, reply.error).toBe(true);
      expect(files.list()).toEqual(['new']);
      // The same career imported again takes its own file's place and keeps the file.
      const again = await target.host.handle(
        req('again', -1, { type: 'import-game', gameId: 'new', replaces: 'new', file }),
      );
      expect(again.ok, again.error).toBe(true);
      expect(files.list()).toEqual(['new']);
    },
    SLOW,
  );

  it(
    'refuses a database whose integrity check does not say ok, deleting its scratch file',
    async () => {
      const files = memoryGames();
      const released: boolean[] = [];
      const original = files.bytes;
      const damaged = {
        ...original,
        scratch: async (content?: Uint8Array) => {
          const scratch = await original.scratch(content);
          return {
            bytes: scratch.bytes,
            driver: {
              ...scratch.driver,
              get: <T>(sql: string, params?: unknown[]) =>
                sql.startsWith('PRAGMA integrity_check')
                  ? ({ integrity_check: 'row 3 missing from index person_cold' } as T)
                  : scratch.driver.get<T>(sql, params),
            },
            release: () => {
              released.push(true);
              scratch.release();
            },
          };
        },
      };
      const target = fileHost(Object.assign(files, { bytes: damaged }));
      const reply = await target.host.handle(
        req('import', -1, { type: 'import-game', gameId: 'incoming', file }),
      );
      expect(reply.ok).toBe(false);
      expect(failure(reply)).toContain(sourceMessage('copy.saveFile.integrity'));
      expect(released).toEqual([true]);
      expect(files.list()).toEqual([]);
      expect(target.host.world).toBeUndefined();
    },
    SLOW,
  );
});
