/**
 * T867 early storage/save-cost probe; run once at the coordinator's integrated gate:
 *   pnpm exec tsx scripts/persisted-size.ts --seasons 10 --reps 3
 * The comparison removes only the squad registry from the same lived world, never retained facts
 * from the production save. Each sample posts one CodecJob over a real structured-clone port.
 */
import { MessageChannel } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { arch, cpus, loadavg, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { historyWorld, liveHistory } from '../packages/engine/src/history';
import type { World } from '../packages/contracts/src/types';
import type { CodecJob } from '../apps/web/src/runtime/protocol';
import { encode } from '../apps/web/src/adapters/persistence';
import { payloadBytes } from '../apps/web/src/adapters/compression';
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
async function main() {
  const arg = (name: string, fallback: string) => {
    const at = process.argv.indexOf(name);
    return at < 0 ? fallback : process.argv[at + 1]!;
  };
  const seasons = Number(arg('--seasons', '10')),
    reps = Number(arg('--reps', '3'));
  if (!Number.isSafeInteger(seasons) || seasons < 1 || !Number.isSafeInteger(reps) || reps < 1)
    throw new Error(message('copy.packing.5ccd8ed532'));
  const world = historyWorld(arg('--seed', 'persisted-size-261113'));
  for (let n = 0; n < seasons; n++) liveHistory(world, world.year + 1);
  const playerCount = Object.values(world.squads ?? {}).reduce((n, squad) => n + squad.length, 0);
  const { squads: _squads, ...without } = world;
  void _squads;
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
      budget: PERSISTED_BUDGET.squads,
      addedBytes,
      bytesPerPlayer: playerCount ? addedBytes / playerCount : null,
      gap: Math.max(0, addedBytes - PERSISTED_BUDGET.squads),
      rows,
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
