/**
 * T867/T865 early storage/save-cost probe; run once at the coordinator's integrated gate:
 *   pnpm exec tsx scripts/persisted-size.ts --seasons 10 --reps 3
 *   pnpm exec tsx scripts/persisted-size.ts --records --seasons 20 --reps 3
 * The comparison removes only the selected registry from the same lived world, never retained facts
 * from the production save. Each sample posts one CodecJob over a real structured-clone port.
 */
import { careerWorld } from '../packages/engine/src/career.testkit';
import { operate } from '../packages/engine/src/operations';
import { simulateSeason } from '../packages/engine/src/season';
import { OWNER_BUSINESS } from '../packages/contracts/src/owner';
import { canonical } from '../packages/contracts/src/index';
import { packPlayerRecords } from '../apps/web/src/adapters/playerRecordPacking';
import { MessageChannel } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { arch, cpus, loadavg, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { historyWorld, liveHistory } from '../packages/engine/src/history';
import type { World } from '../packages/contracts/src/types';
import type { CodecJob } from '../apps/web/src/runtime/protocol';
import { encode } from '../apps/web/src/adapters/persistence';
import { encodePayload, payloadBytes } from '../apps/web/src/adapters/compression';
import { ACTIVE, type Envelope } from '../apps/web/src/adapters/repository';
import { message } from '../packages/contracts/src/messages';

export const PERSISTED_BUDGET = { squads: 500_000, records: 450_000 } as const;

async function sample(world: World) {
  const { port1, port2 } = new MessageChannel();
  try {
    const received = new Promise<CodecJob>((done) => port2.once('message', done));
    const start = performance.now();
    port1.postMessage({ id: 1, world, generation: 1, parentGeneration: 0 } satisfies CodecJob);
    const postMs = performance.now() - start;
    const job = await received;
    const encodeStart = performance.now();
    const raw = await encode(job.world, job.generation, job.parentGeneration);
    const encodeMs = performance.now() - encodeStart;
    const envelope = JSON.parse(raw) as Envelope;
    return {
      postMs,
      encodeMs,
      codec: envelope.codec,
      payloadBytes: payloadBytes(envelope.codec, envelope.payload).length,
      portableBytes: Buffer.byteLength(raw),
      checkpointBytes: (raw.length + ACTIVE.length) * 2,
    };
  } finally {
    port1.close();
    port2.close();
  }
}
/** Standalone record streams and whole-checkpoint increments are both reported: compression is not additive. */
async function measureRecords(world: World, seasons: number, addedBytes: number) {
  const records = world.playerRecords ?? {};
  const compressed = async (part: NonNullable<World['playerRecords']>) => {
    const raw = new TextEncoder().encode(canonical(packPlayerRecords(part)));
    const encoded = await encodePayload(raw);
    return { codec: encoded.codec, payloadBytes: payloadBytes(encoded.codec, encoded.payload).length };
  };
  const pick = (part: 'moves' | 'lines' | 'profiles' | 'links'): NonNullable<World['playerRecords']> => {
    const selected: NonNullable<World['playerRecords']> = {};
    for (const [id, record] of Object.entries(records)) {
      if (part === 'moves' && (record.moves.length || record.loan))
        selected[id] = { moves: record.moves, ...(record.loan ? { loan: record.loan } : {}) };
      if (part === 'lines' && record.lines?.length) selected[id] = { moves: [], lines: record.lines };
      if (part === 'profiles' && record.retired) selected[id] = { moves: [], retired: record.retired };
      if (part === 'links' && record.linked !== undefined) selected[id] = { moves: [], linked: record.linked };
    }
    return selected;
  };
  const full = await compressed(records), components = {} as Record<string, Awaited<ReturnType<typeof compressed>>>;
  for (const part of ['moves', 'lines', 'profiles', 'links'] as const) components[part] = await compressed(pick(part));
  const keptPerSeason = world.history.map((season) => ({
    year: season.year,
    kept: Object.values(records).filter((record) => record.retired?.year === season.year).length,
  }));
  const kept = keptPerSeason.reduce((sum, season) => sum + season.kept, 0);
  const linear100 = {
    kept: kept * 100 / seasons,
    payloadBytes: full.payloadBytes * 100 / seasons,
    checkpointIncrementBytes: addedBytes * 100 / seasons,
  };
  return { full, components, keptPerSeason, kept, linear100, budget: PERSISTED_BUDGET.records,
    gap100: Math.max(0, linear100.payloadBytes - PERSISTED_BUDGET.records) };
}
async function main() {
  const arg = (name: string, fallback: string) => {
    const at = process.argv.indexOf(name);
    return at < 0 ? fallback : process.argv[at + 1]!;
  };
  const recordsMode = process.argv.includes('--records');
  const seasons = Number(arg('--seasons', recordsMode ? '20' : '10')),
    reps = Number(arg('--reps', '3'));
  if (!Number.isSafeInteger(seasons) || seasons < 1 || !Number.isSafeInteger(reps) || reps < 1)
    throw new Error(message('copy.packing.5ccd8ed532'));
  const seed = arg('--seed', recordsMode ? 'persisted-records-261113' : 'persisted-size-261113');
  const world = recordsMode ? careerWorld({ country: 'ENG', seed }) : historyWorld(seed);
  if (recordsMode) operate(world, { type: 'owner-stake', percent: OWNER_BUSINESS.stake.max });
  for (let n = 0; n < seasons; n++) {
    if (recordsMode) simulateSeason(world);
    else liveHistory(world, world.year + 1);
    if (world.history.length !== n + 1) throw new Error(message('copy.packing.5ccd8ed532'));
  }
  const playerCount = Object.values(world.squads ?? {}).reduce((n, squad) => n + squad.length, 0);
  const without = { ...world };
  if (recordsMode) delete without.playerRecords;
  else delete without.squads;
  type Sample = Awaited<ReturnType<typeof sample>>;
  const rows: { before: Sample; after: Sample }[] = [];
  // Alternate order so compression warm-up and shared-machine load affect both sides.
  for (let rep = 0; rep < reps; rep++) {
    let before: Sample, after: Sample;
    if (rep % 2) {
      after = await sample(world);
      before = await sample(without);
    } else {
      before = await sample(without);
      after = await sample(world);
    }
    rows.push({ before, after });
  }
  const addedBytes = rows[0]!.after.payloadBytes - rows[0]!.before.payloadBytes;
  const recordSizes = recordsMode ? await measureRecords(world, seasons, addedBytes) : undefined;
  console.log(
    JSON.stringify({
      source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      machine: {
        platform: platform(),
        arch: arch(),
        release: release(),
        cpu: cpus()[0]?.model,
        load: loadavg(),
        node: process.version,
      },
      seed: world.seed,
      seasons,
      year: world.year,
      playerCount,
      ...(recordSizes ? { records: recordSizes } : {}),
      budget: recordsMode ? PERSISTED_BUDGET.records : PERSISTED_BUDGET.squads,
      addedBytes,
      bytesPerPlayer: playerCount ? addedBytes / playerCount : null,
      gap: Math.max(0, addedBytes - (recordsMode ? PERSISTED_BUDGET.records : PERSISTED_BUDGET.squads)),
      rows,
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
