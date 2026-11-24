/**
 * The engine's own match day in isolation (T1064, →ARCH-34): the e2e manual career of
 * `scripts/perf/waits.ts` is played through the real Host to each own match eve; there the next
 * day (`advanceDays(w, 1, undefined, false)`, as the host's day step plays it without helpers) is
 * lived `--reps` times on copies of the world (`cloneWorld`, the same record store), timing each
 * and hashing the world it leaves. The host then plays the same day as the client does.
 *
 *   tsx artifacts/benchmarks/T1064/day.ts [--tree <repo root>] [--eves 12] [--reps 3]
 *     [--decade 1930] [--seed records-room-journey] [--out <result.json>]
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
const eves = Number(flag('--eves', '12'));
const reps = Number(flag('--reps', '3'));
const decade = Number(flag('--decade', '1930'));
const load = async <T>(path: string): Promise<T> =>
  (await import(pathToFileURL(resolve(tree, path)).href)) as T;

/* eslint-disable @typescript-eslint/no-explicit-any -- the engine is loaded from a chosen tree */
const { Host } = await load<any>('apps/web/src/runtime/host.ts');
const { memoryGames } = await load<any>('tests/fixtures/save-file.ts');
const { RESPONSIBILITY_KEYS } = await load<any>('packages/engine/src/responsibilities.ts');
const { daysUntilNextMatch, currentDay } = await load<any>('packages/engine/src/calendar.ts');
const { advanceDays } = await load<any>('packages/engine/src/season.ts');
const { canonical } = await load<any>('packages/contracts/src/index.ts');
const { cloneWorld } = await load<any>('packages/contracts/src/record-store.ts');

const games = memoryGames();
const host = new Host(() => {}, {
  openStore: games.open,
  gameFiles: { list: games.list, remove: games.remove },
  databaseBytes: games.bytes,
});
let n = 0;
const req = (body: unknown) => ({
  protocol: 1,
  session: 'day',
  requestId: `d${n++}`,
  expectedRevision: host.world?.revision ?? -1,
  body,
});
const ok = async (body: unknown) => {
  const reply = await host.handle(req(body));
  if (!reply.ok) throw new Error(reply.error);
  return reply;
};
const generated = await ok({ type: 'generate', choice: { tier: 'oil', traits: [], decade, seed } });
const club = generated.start.listings.find((listing: any) => listing.affordable);
await ok({ type: 'take-over', clubId: club.clubId });
const w0 = host.world;
w0.settings.mode = 'manual';
for (const key of RESPONSIBILITY_KEYS) w0.settings.responsibilities[key] = 'delegated';
w0.settings.observations.matchEve = true;
w0.settings.observations.windowOpen = false;
await ok({ type: 'create-game', gameId: 'g' });

const hash = (w: unknown) =>
  createHash('sha256')
    .update(canonical({ ...(w as object), receiptIds: [] }))
    .digest('hex')
    .slice(0, 16);
/** Named so a CPU profile can isolate the timed own match days from the host's other days. */
function ownMatchDay(copy: unknown) {
  return advanceDays(copy, 1, undefined, false);
}
const rows: Record<string, unknown>[] = [];
let guard = 0;
while (rows.length < eves && guard++ < 10 * eves) {
  const w = host.world;
  if (daysUntilNextMatch(w) !== 1) {
    await ok({ type: 'command', command: { type: 'next-event' } });
    continue;
  }
  const from = `${w.year}.${currentDay(w)}`;
  const ms: number[] = [];
  const hashes = new Set<string>();
  let playbackHash = '';
  for (let r = 0; r < reps; r++) {
    const copy = cloneWorld(w);
    const t = performance.now();
    const p = ownMatchDay(copy);
    ms.push(performance.now() - t);
    hashes.add(hash(copy));
    playbackHash = createHash('sha256')
      .update(canonical(p?.record ?? null))
      .digest('hex')
      .slice(0, 16);
  }
  const round = w.round;
  await ok({ type: 'command', command: { type: 'advance-days', days: 1 } });
  const lived = hash(host.world);
  rows.push({
    from,
    league: host.world.round !== round,
    ms,
    hash: [...hashes].join(','),
    lived,
    playbackHash,
  });
  console.error(`${from} ${ms.map((x) => x.toFixed(0)).join(' ')} ms ${[...hashes].join(',')}`);
  await ok({ type: 'save' });
}
const report = {
  tree,
  seed,
  decade,
  reps,
  environment: {
    node: process.version,
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    loadavg: loadavg(),
  },
  final: hash(host.world),
  rows,
};
const out = flag('--out');
if (out) (await import('node:fs')).writeFileSync(out, JSON.stringify(report) + '\n');
console.log(JSON.stringify({ final: report.final, eves: rows.length }));
