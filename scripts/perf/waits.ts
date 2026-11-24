/**
 * The waits a player sits through, measured through the real worker host (T1058, →ARCH-34): a
 * manual-mode career's 다음 이벤트 steps with the save that follows each stop, an owner decision with
 * its save, the office's stopped reads, then closing, reopening, exporting and importing the game.
 * Each wait is split into the parts that contribute — the engine's days, the view projection, its
 * delta against the client's base, the reply's structured clone (what `postMessage` copies), the
 * save's cold moves, row diff and SQLite write — by timing the host's own methods in place.
 *
 *   tsx scripts/perf/waits.ts [--seed records-room-journey] [--steps 40] [--decade 1930]
 *     [--tree <repo root>] [--out <result.json>]
 *
 * `--tree` loads the host from another checkout of this repository (its `node_modules` linked), so
 * a baseline and a candidate run the same driver; the game database is `node:sqlite` in memory, the
 * schema the browser's OPFS database shares. OPFS write speed is not measured here.
 */
import { createHash } from 'node:crypto';
import { cpus, loadavg } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const tree = resolve(flag('--tree', '.')!);
const seed = flag('--seed', 'records-room-journey')!;
const steps = Number(flag('--steps', '40'));
const decade = Number(flag('--decade', '1930'));
const load = async <T>(path: string): Promise<T> =>
  (await import(pathToFileURL(resolve(tree, path)).href)) as T;

/* eslint-disable @typescript-eslint/no-explicit-any -- the host is loaded from a chosen tree */
const { Host } = await load<any>('apps/web/src/runtime/host.ts');
const { ViewPublisher, forPosting } = await load<any>('apps/web/src/runtime/viewPublisher.ts');
const { RowSaver } = await load<any>('apps/web/src/adapters/rowSaver.ts');
const { memoryGames } = await load<any>('tests/fixtures/save-file.ts');
const { RESPONSIBILITY_KEYS } = await load<any>('packages/engine/src/responsibilities.ts');
const { daysUntilNextMatch, currentDay } = await load<any>('packages/engine/src/calendar.ts');
const { canonical } = await load<any>('packages/contracts/src/index.ts');
const { worldFacts } = await load<any>('apps/web/src/adapters/worldRows.ts');

/** Time spent inside each patched method during the current measurement. */
const spent: Record<string, number> = {};
const reset = () => {
  for (const key of Object.keys(spent)) delete spent[key];
};
function timeMethod(proto: any, name: string, label: string) {
  const original = proto[name];
  proto[name] = function (this: unknown, ...rest: unknown[]) {
    const t = performance.now();
    const out = original.apply(this, rest);
    if (out instanceof Promise)
      return out.finally(() => (spent[label] = (spent[label] ?? 0) + performance.now() - t));
    spent[label] = (spent[label] ?? 0) + performance.now() - t;
    return out;
  };
}
timeMethod(Host.prototype, 'publish', 'publish');
timeMethod(Host.prototype, 'projection', 'projection');
timeMethod(Host.prototype, 'slowReads', 'slowReads');
timeMethod(ViewPublisher.prototype, 'publish', 'delta');
timeMethod(Host.prototype, 'save', 'save');
timeMethod(RowSaver.prototype, 'save', 'rowSave');
const games = memoryGames({
  wrap: (game: any) => ({
    ...game.store,
    write(changes: any) {
      const t = performance.now();
      game.store.write(changes);
      spent.sqlite = (spent.sqlite ?? 0) + performance.now() - t;
      spent.rowsPut = (spent.rowsPut ?? 0) + changes.put.length;
    },
  }),
});
const host = new Host(() => {}, {
  openStore: games.open,
  gameFiles: { list: games.list, remove: games.remove },
  databaseBytes: games.bytes,
});
let n = 0;
const req = (body: unknown, viewBase?: number) => ({
  protocol: 1,
  session: 'waits',
  requestId: `w${n++}`,
  expectedRevision: host.world?.revision ?? -1,
  body,
  ...(viewBase === undefined ? {} : { viewBase }),
});
let viewSeq: number | undefined;
/** One request as the client sends it, with its parts' times and the reply's clone cost. */
async function measure(kind: string, body: unknown) {
  reset();
  const t = performance.now();
  const reply = await host.handle(req(body, viewSeq));
  const ms = performance.now() - t;
  if (!reply.ok) throw new Error(`${kind}: ${reply.error}`);
  if (reply.viewSeq !== undefined) viewSeq = reply.viewSeq;
  const c = performance.now();
  const posted = forPosting(reply);
  structuredClone(posted);
  const cloneMs = performance.now() - c;
  // What the client receives, for comparing a candidate's replies with the baseline's.
  const { file, ...rest } = posted as { file?: Uint8Array };
  const replyHash = createHash('sha256')
    .update(JSON.stringify(rest))
    .update(file ?? new Uint8Array())
    .digest('hex')
    .slice(0, 16);
  return { kind, ms, cloneMs, replyHash, ...spent, reply };
}

const started = performance.now();
const generated = await host.handle(
  req({ type: 'generate', choice: { tier: 'oil', traits: [], decade, seed } }),
);
if (!generated.ok) throw new Error(generated.error);
const club = generated.start.listings.find((listing: any) => listing.affordable);
const taken = await host.handle(req({ type: 'take-over', clubId: club.clubId }));
if (!taken.ok) throw new Error(taken.error);
viewSeq = taken.viewSeq;
// The e2e journeys' manual career: every business responsibility delegated, match eve on.
const w = host.world;
w.settings.mode = 'manual';
for (const key of RESPONSIBILITY_KEYS) w.settings.responsibilities[key] = 'delegated';
w.settings.observations.matchEve = true;
w.settings.observations.windowOpen = false;
const created = await measure('create-game', { type: 'create-game', gameId: 'g' });
const startMs = performance.now() - started;

const rows: Record<string, unknown>[] = [];
const strip = ({ reply, ...rest }: any) => {
  void reply;
  return rest;
};
rows.push({ ...strip(created), step: -1 });
for (let step = 0; step < steps; step++) {
  const world = host.world;
  const command =
    daysUntilNextMatch(world) === 1 ? { type: 'advance-days', days: 1 } : { type: 'next-event' };
  const from = `${world.year}.${currentDay(world)}`;
  const advanced = await measure(command.type, { type: 'command', command });
  const to = `${host.world.year}.${currentDay(host.world)}`;
  const saved = await measure('save', { type: 'save' });
  const office = await measure('stopped-reads', { type: 'stopped-reads', world: host.world.id });
  rows.push({ step, from, to, ...strip(advanced) });
  rows.push({ step, ...strip(saved) });
  rows.push({ step, ...strip(office) });
  // An owner decision at every fifth stop: the ticket price, saved at once (→SAVE-8).
  if (step % 5 === 4) {
    const price = step % 10 === 4 ? 0.08 : 0.05;
    const decided = await measure('decision', {
      type: 'command',
      command: { type: 'club-ticket', price },
    });
    const decisionSave = await measure('decision-save', { type: 'save' });
    rows.push({ step, ...strip(decided) });
    rows.push({ step, ...strip(decisionSave) });
  }
  console.error(
    `${step} ${command.type} ${from}->${to} ${advanced.ms.toFixed(0)} ms, save ${saved.ms.toFixed(0)} ms`,
  );
}
const hash = createHash('sha256')
  .update(worldFacts({ ...host.world, receiptIds: [] }))
  .digest('hex')
  .slice(0, 16);
const memoryHash = createHash('sha256')
  .update(canonical({ ...host.world, receiptIds: [] }))
  .digest('hex')
  .slice(0, 16);
// The game closed, opened again, exported and imported as a new game.
await measure('close', { type: 'close-game' });
const opened = await measure('open-game', { type: 'open-game', gameId: 'g' });
const reopenedHash = createHash('sha256')
  .update(worldFacts({ ...host.world, receiptIds: [] }))
  .digest('hex')
  .slice(0, 16);
const exported = await measure('export-game', { type: 'export-game', gameId: 'g' });
const file = exported.reply.file as Uint8Array;
const imported = await measure('import-game', {
  type: 'import-game',
  gameId: 'h',
  file,
});
for (const r of [opened, exported, imported]) rows.push({ step: steps, ...strip(r) });
const report = {
  tree,
  seed,
  decade,
  steps,
  startMs,
  hash,
  memoryHash,
  reopenedHash,
  exportBytes: file.length,
  environment: {
    node: process.version,
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    loadavg: loadavg(),
  },
  rows,
};
const out = flag('--out');
if (out) (await import('node:fs')).writeFileSync(out, JSON.stringify(report) + '\n');
console.log(JSON.stringify({ hash, memoryHash, reopenedHash, startMs }));
