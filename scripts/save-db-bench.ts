/**
 * The database save's measurements (T1022, →ARCH-14, →SAVE-3/4/13): a world is handed to the real
 * worker host on a game database in a temporary file (`node:sqlite`, the schema the browser's OPFS
 * database shares), and what a save costs is read off the host's own `create-game`, `save` and
 * `open-game` requests. Browser OPFS write speed is not measured here.
 *
 *   tsx scripts/save-db-bench.ts build takeover-1980|takeover-2000|ten-rich --out <world.bin>
 *   tsx scripts/save-db-bench.ts measure <label> <world.bin|world.json> [--runs 3] [--out <result.json>]
 *
 * `build` makes a world once (generateHistory + takeOver as the worker does for a takeover, or the
 * codec fixture's ten seasons) and keeps it as a V8 snapshot; the 100-season worlds come from the
 * storage benchmark's own builders (`scripts/benchmark.ts --phase baseline-1|baseline-2|
 * active-management-1|active-management-2` keep `<variant>-round23.world.json`). `measure` loads
 * the world afresh for each run, so a run never sees a previous run's cold rows.
 */
import v8 from 'node:v8';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { World } from '../packages/contracts/src/types';
import type { RecordChanges, RecordStore } from '../packages/contracts/src/record-store';
import type { Body } from '../apps/web/src/runtime/protocol';
import { Host } from '../apps/web/src/runtime/host';
import { encodeSaveFile, saveMetaOf } from '../apps/web/src/adapters/saveFile';
import { rowsToWorld } from '../apps/web/src/adapters/worldRows';
import { sqlRecordStore } from '../apps/web/src/adapters/sqlRecordStore';
import { gzip } from '../apps/web/src/adapters/compression';
import { nodeSqliteDriver } from '../tests/fixtures/node-sqlite';

const MIB = 1024 * 1024;
const SAVE_EXPORT_LIMIT = 256 * MIB;
const SAVE_DATABASE_LIMIT = 1024 * MIB;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const cpu = () => {
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1000;
};
const mb = (bytes: number) => bytes / MIB;

async function build(kind: string, out: string) {
  const { generateHistory } = await import('../packages/engine/src/history');
  const { takeOver } = await import('../packages/engine/src/takeover');
  const { initializeReadModels } = await import('../packages/engine/src/read-models');
  const { careerClub } = await import('../packages/engine/src/career.testkit');
  const started = performance.now();
  let w: World;
  if (kind === 'ten-rich') {
    const { tenRichSeasons } = await import('../apps/web/src/adapters/persistence.testkit');
    w = tenRichSeasons();
  } else {
    const year = Number(kind.replace('takeover-', ''));
    // As the worker does for a takeover (→WORLD-13, ECON-38): the history, the club, the read models.
    const history = generateHistory('perf-261027', year as never);
    w = takeOver(history, careerClub('ENG'), { tier: 'oil', traits: [] } as never);
    initializeReadModels(w);
  }
  writeFileSync(out, v8.serialize(w));
  console.error(`built ${kind} in ${((performance.now() - started) / 1000).toFixed(0)} s`);
}

async function loadWorld(file: string): Promise<World> {
  const bytes = readFileSync(file);
  const w = file.endsWith('.json')
    ? (JSON.parse(bytes.toString('utf8')) as World)
    : (v8.deserialize(bytes) as World);
  // A game in play carries its read models from the takeover on (the host initializes them); a
  // world simulated in the engine alone does not, and the host's writer upgrade would otherwise
  // reconstruct them from rows already moved out of memory.
  if (!w.newsJournal || !w.careerReads) {
    const { initializeReadModels } = await import('../packages/engine/src/read-models');
    initializeReadModels(w);
  }
  return w;
}

/** UTF-8 bytes of a world's JSON, summed per top-level field so a century never meets the string limit. */
function jsonBytes(w: World) {
  let total = 2;
  for (const [key, value] of Object.entries(w))
    total +=
      Buffer.byteLength(JSON.stringify(key)) +
      2 +
      Buffer.byteLength(JSON.stringify(value) ?? 'null');
  return total;
}
const peopleOf = (w: World) => Object.keys((w as { people?: object }).people ?? {}).length;

const req = (id: string, revision: number, body: Body) => ({
  protocol: 1,
  session: 'bench',
  requestId: id,
  expectedRevision: revision,
  body,
});

/** One run: create the game, play seven days and save, again seven days and save, reopen, export. */
async function run(world: World, dir: string, label: string) {
  const file = join(dir, `${label}.sqlite3`);
  rmSync(file, { force: true });
  const writes: { put: number; delete: number }[] = [];
  const open = (gameId: string, { create }: { create: boolean }): RecordStore | undefined => {
    void gameId;
    if (!create && !statSync(file, { throwIfNoEntry: false })) return undefined;
    const inner = sqlRecordStore(nodeSqliteDriver(file));
    return {
      ...inner,
      write(changes: RecordChanges) {
        inner.write(changes);
        writes.push({ put: changes.put.length, delete: changes.delete.length });
      },
    };
  };
  const files = { list: () => ['g'], remove: () => {} };
  const timed = async <T>(fn: () => Promise<T>) => {
    const c = cpu();
    const t = performance.now();
    const value = await fn();
    return { value, ms: performance.now() - t, cpuMs: cpu() - c };
  };
  const host = new Host(undefined, { openStore: open, gameFiles: files });
  host.world = world;
  const people = { start: peopleOf(world), players: world.players.length };
  const first = await timed(() =>
    host.handle(req('create', world.revision, { type: 'create-game', gameId: 'g' })),
  );
  if (!first.value.ok) throw new Error(`create-game: ${first.value.error}`);
  const firstWrite = writes.at(-1)!;
  const advance = async (id: string, days: number) => {
    // A command plays at most 31 days; a critical alert blocks the clock until the owner
    // acknowledges it (the player's one tap).
    let ms = 0;
    for (let left = days, part = 0; left > 0; part++) {
      const step = Math.min(left, 31);
      if (host.world!.critical)
        await host.handle(req(`ack-${id}-${part}`, host.world!.revision, { type: 'ack-critical' }));
      const played = await timed(() =>
        host.handle(
          req(`${id}-${part}`, host.world!.revision, {
            type: 'command',
            command: { type: 'advance-days', days: step },
          }),
        ),
      );
      if (!played.value.ok) throw new Error(`advance-days: ${played.value.error}`);
      ms += played.ms;
      left -= step;
    }
    return { ms };
  };
  const saves: Record<string, unknown>[] = [];
  // Seven days, seven more, then 49 days on and seven more, where own matches have been played.
  for (const [n, days] of [
    [1, 7],
    [2, 7],
    [3, 49],
    [4, 7],
  ] as const) {
    const played = await advance(`days-${n}`, days);
    const saved = await timed(() => host.handle(req(`save-${n}`, -1, { type: 'save' })));
    if (!saved.value.ok) throw new Error(`save: ${saved.value.error}`);
    const write = writes.at(-1)!;
    saves.push({
      saveMs: saved.ms,
      saveCpuMs: saved.cpuMs,
      rowsPut: write.put,
      rowsDeleted: write.delete,
      daysMs: played.ms,
      daysPlayed: days,
      year: host.world!.year,
      round: host.world!.round,
      ownMatches: host.world!.ownMatches.length,
      peopleInMemory: peopleOf(host.world!),
      players: host.world!.players.length,
    });
  }
  await host.handle(req('close', -1, { type: 'close-game' }));
  const databaseBytes = statSync(file).size;

  const reopened = new Host(undefined, { openStore: open, gameFiles: files });
  const opened = await timed(() =>
    reopened.handle(req('open', -1, { type: 'open-game', gameId: 'g' })),
  );
  if (!opened.value.ok) throw new Error(`open-game: ${opened.value.error}`);
  const heapAfterOpenMb = mb(process.memoryUsage().heapUsed);
  const rssAfterOpenMb = mb(process.memoryUsage().rss);
  const peopleOpened = peopleOf(reopened.world!);
  await reopened.handle(req('close', -1, { type: 'close-game' }));

  // The world the database holds: what memory keeps against all of it, cold rows included.
  const reader = nodeSqliteDriver(file);
  const store = sqlRecordStore(reader);
  const meta = saveMetaOf(store.meta());
  const memoryJson = jsonBytes(rowsToWorld(store, { includeCold: false }));
  const complete = rowsToWorld(store, { includeCold: true });
  const completeJson = jsonBytes(complete);
  const completePeople = peopleOf(complete);
  reader.close();

  const bytes = readFileSync(file);
  const exported = await timed(async () => {
    try {
      return { size: (await encodeSaveFile(meta, bytes)).length, overLimit: false };
    } catch {
      return { size: (await gzip(bytes, true, 4 * 1024 * MIB)).length, overLimit: true };
    }
  });
  rmSync(file, { force: true });
  return {
    firstSave: {
      ms: first.ms,
      cpuMs: first.cpuMs,
      rowsPut: firstWrite.put,
      rowsDeleted: firstWrite.delete,
    },
    saves,
    openMs: opened.ms,
    openCpuMs: opened.cpuMs,
    heapAfterOpenMb,
    rssAfterOpenMb,
    completeJsonMb: mb(completeJson),
    memoryJsonMb: mb(memoryJson),
    peopleStart: people.start,
    peopleInMemoryAfterOpen: peopleOpened,
    peopleComplete: completePeople,
    playersStart: people.players,
    databaseMb: mb(databaseBytes),
    exportMb: mb(exported.value.size),
    exportMs: exported.ms,
    exportOverLimit: exported.value.overLimit,
  };
}

async function measure(label: string, file: string) {
  const runs = Number(flag('--runs') ?? 3);
  const dir = flag('--tmp') ?? '.tmp/save-db-bench';
  mkdirSync(dir, { recursive: true });
  const results: Awaited<ReturnType<typeof run>>[] = [];
  for (let n = 0; n < runs; n++) {
    const world = await loadWorld(file);
    console.error(`${label}: run ${n + 1}/${runs}, year ${world.year} round ${world.round}`);
    results.push(await run(world, dir, label));
    global.gc?.();
  }
  const m = (pick: (r: (typeof results)[number]) => number) => median(results.map(pick));
  const summary = {
    firstSaveMs: m((r) => r.firstSave.ms),
    firstSaveRows: m((r) => r.firstSave.rowsPut),
    save7Ms: m((r) => r.saves[0]!.saveMs as number),
    save7Rows: m((r) => r.saves[0]!.rowsPut as number),
    save7PeopleInMemory: m((r) => r.saves[0]!.peopleInMemory as number),
    save14Ms: m((r) => r.saves[1]!.saveMs as number),
    save14Rows: m((r) => r.saves[1]!.rowsPut as number),
    save63Ms: m((r) => r.saves[2]!.saveMs as number),
    save63Rows: m((r) => r.saves[2]!.rowsPut as number),
    save70Ms: m((r) => r.saves[3]!.saveMs as number),
    save70Rows: m((r) => r.saves[3]!.rowsPut as number),
    openMs: m((r) => r.openMs),
    completeJsonMb: m((r) => r.completeJsonMb),
    memoryJsonMb: m((r) => r.memoryJsonMb),
    peopleStart: results[0]!.peopleStart,
    peopleInMemoryAfterOpen: m((r) => r.peopleInMemoryAfterOpen),
    peopleComplete: m((r) => r.peopleComplete),
    databaseMb: m((r) => r.databaseMb),
    exportMb: m((r) => r.exportMb),
    exportMs: m((r) => r.exportMs),
  };
  const report = {
    label,
    source: file,
    at: new Date().toISOString(),
    runs,
    limits: { exportMib: SAVE_EXPORT_LIMIT / MIB, databaseMib: SAVE_DATABASE_LIMIT / MIB },
    environment: {
      node: process.version,
      platform: platform(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      loadavg: (await import('node:os')).loadavg(),
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    },
    summary,
    results,
  };
  const out = flag('--out');
  if (out) writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

const [mode, a, b] = args;
if (mode === 'build') await build(a!, flag('--out')!);
else if (mode === 'measure') await measure(a!, b!);
else throw new Error('usage: save-db-bench.ts build <kind> --out <file> | measure <label> <file>');
