/**
 * T867/T865 early storage/save-cost probe; run once at the coordinator's integrated gate:
 *   pnpm exec tsx scripts/persisted-size.ts --seasons 10 --reps 3
 *   pnpm exec tsx scripts/persisted-size.ts --records --seasons 20 --reps 3
 * The comparison removes only the selected registry from the same lived world, never retained facts
 * from the production save. Each sample posts one CodecJob over a real structured-clone port.
 */
import { careerClub, careerWorld } from '../packages/engine/src/career.testkit';
import { takeOver } from '../packages/engine/src/takeover';
import { operate } from '../packages/engine/src/operations';
import { simulateSeason } from '../packages/engine/src/season';
import { OWNER_BUSINESS } from '../packages/engine/src/owner-config';
import { canonical } from '../packages/contracts/src/index';
import { packPlayerRecords } from '../apps/web/src/adapters/playerRecordPacking';
import { packSquads } from '../apps/web/src/adapters/squadPacking';
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
import { writeFileSync } from 'node:fs';
import { measurementIdentity } from './lib/measurement-identity';
import { careerEnded } from '../packages/contracts/src/owner';

export const PERSISTED_BUDGET = { squads: 500_000, records: 450_000 } as const;

async function sample(world: World) {
  const { port1, port2 } = new MessageChannel();
  try {
    const received = new Promise<CodecJob>((done) => port2.once('message', done));
    const start = performance.now();
    port1.postMessage({
      id: 'persisted-size',
      world,
      generation: 1,
      parentGeneration: 0,
    } satisfies CodecJob);
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
async function compressedStream(value: unknown) {
  const raw = new TextEncoder().encode(canonical(value));
  const encoded = await encodePayload(raw);
  return {
    codec: encoded.codec,
    payloadBytes: payloadBytes(encoded.codec, encoded.payload).length,
  };
}
/** Standalone record streams and whole-checkpoint increments are both reported: compression is not additive. */
async function measureRecords(world: World, seasons: number, addedBytes?: number) {
  const records = world.playerRecords ?? {};
  const compressed = (part: NonNullable<World['playerRecords']>) =>
    compressedStream(packPlayerRecords(part));
  const pick = (
    part: 'moves' | 'lines' | 'profiles' | 'links',
  ): NonNullable<World['playerRecords']> => {
    const selected: NonNullable<World['playerRecords']> = {};
    for (const [id, record] of Object.entries(records)) {
      if (part === 'moves' && (record.moves.length || record.loan))
        selected[id] = { moves: record.moves, ...(record.loan ? { loan: record.loan } : {}) };
      if (part === 'lines' && record.lines?.length)
        selected[id] = { moves: [], lines: record.lines };
      if (part === 'profiles' && record.retired)
        selected[id] = { moves: [], retired: record.retired };
      if (part === 'links' && record.linked !== undefined)
        selected[id] = { moves: [], linked: record.linked };
    }
    return selected;
  };
  const full = await compressed(records),
    components = {} as Record<string, Awaited<ReturnType<typeof compressed>>>;
  for (const part of ['moves', 'lines', 'profiles', 'links'] as const)
    components[part] = await compressed(pick(part));
  const keptPerSeason = world.history.map((season) => ({
    year: season.year,
    kept: Object.values(records).filter((record) => record.retired?.year === season.year).length,
  }));
  const kept = keptPerSeason.reduce((sum, season) => sum + season.kept, 0);
  const linear100 = seasons
    ? {
        kept: (kept * 100) / seasons,
        payloadBytes: (full.payloadBytes * 100) / seasons,
        checkpointIncrementBytes: addedBytes === undefined ? null : (addedBytes * 100) / seasons,
      }
    : null;
  return {
    full,
    components,
    keptPerSeason,
    kept,
    linear100,
    budget: PERSISTED_BUDGET.records,
    gap100: linear100 ? Math.max(0, linear100.payloadBytes - PERSISTED_BUDGET.records) : null,
  };
}
async function main() {
  const arg = (name: string, fallback: string) => {
    const at = process.argv.indexOf(name);
    return at < 0 ? fallback : process.argv[at + 1]!;
  };
  const recordsMode = process.argv.includes('--records');
  const out = arg('--out', '');
  const worldOut = arg('--world-out', '');
  // Capture the actual loaded runner before the simulation, rather than reading a later edit.
  const computation = measurementIdentity('scripts/persisted-size.ts');
  const seasons = Number(arg('--seasons', recordsMode ? '20' : '10')),
    reps = Number(arg('--reps', '3'));
  if (!Number.isSafeInteger(seasons) || seasons < 1 || !Number.isSafeInteger(reps) || reps < 1)
    throw new Error(message('copy.packing.5ccd8ed532'));
  const seed = arg('--seed', recordsMode ? 'persisted-records-261113' : 'persisted-size-261113');
  const world = recordsMode ? careerWorld({ country: 'ENG', seed }) : historyWorld(seed);
  const preservePartial = async (error: unknown) => {
    if (worldOut) writeFileSync(worldOut, JSON.stringify(world));
    const partial = {
      complete: false,
      measuredAt: new Date().toISOString(),
      computation,
      seed,
      requestedSeasons: seasons,
      completedSeasons: world.history.length,
      year: world.year,
      historyYears: world.history.map((h) => h.year),
      careerEnded: careerEnded(world),
      bankrupt: world.bankrupt,
      ended: world.ended,
      playerClub: world.playerClub,
      cash: world.cash,
      error: error instanceof Error ? error.message : String(error),
      records: recordsMode ? await measureRecords(world, world.history.length) : undefined,
      squads: await compressedStream(packSquads(world.squads ?? {})),
    };
    if (out) writeFileSync(out + '.partial.json', JSON.stringify(partial, null, 2) + '\n');
    console.error(JSON.stringify(partial));
  };
  if (recordsMode) operate(world, { type: 'owner-stake', percent: OWNER_BUSINESS.stake.max });
  for (let n = 0; n < seasons; n++) {
    if (recordsMode) simulateSeason(world);
    else liveHistory(world, world.year + 1);
    if (world.history.length !== n + 1) {
      const error = new Error(message('copy.packing.5ccd8ed532'));
      await preservePartial(error);
      throw error;
    }
  }
  // A generated history is not an owned checkpoint. Use the real new-game boundary before
  // measuring its save, retaining the lived NPC facts and moving the bought squad to players.
  if (!recordsMode) takeOver(world, careerClub(), { tier: 'oil', traits: [] });
  if (worldOut) writeFileSync(worldOut, JSON.stringify(world));
  const playerCount = Object.values(world.squads ?? {}).reduce((n, squad) => n + squad.length, 0);
  const without = { ...world };
  if (recordsMode) delete without.playerRecords;
  else delete without.squads;
  type Sample = Awaited<ReturnType<typeof sample>>;
  const rows: { before: Sample; after: Sample }[] = [];
  // Alternate order so compression warm-up and shared-machine load affect both sides.
  try {
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
  } catch (error) {
    await preservePartial(error);
    throw error;
  }
  const addedBytes = rows[0]!.after.payloadBytes - rows[0]!.before.payloadBytes;
  const recordSizes = recordsMode ? await measureRecords(world, seasons, addedBytes) : undefined;
  const squadSizes = recordsMode
    ? undefined
    : await compressedStream(packSquads(world.squads ?? {}));
  const result = {
    measuredAt: new Date().toISOString(),
    computation,
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
    ownership: recordsMode ? 'owned-throughout' : 'takeover-after-ownerless-history',
    complete: true,
    seasons,
    year: world.year,
    playerCount,
    ...(recordSizes ? { records: recordSizes } : {}),
    ...(squadSizes
      ? {
          squads: {
            full: squadSizes,
            incrementBytes: addedBytes,
            budget: PERSISTED_BUDGET.squads,
            standaloneGap: Math.max(0, squadSizes.payloadBytes - PERSISTED_BUDGET.squads),
          },
        }
      : {}),
    budget: recordsMode ? PERSISTED_BUDGET.records : PERSISTED_BUDGET.squads,
    addedBytes,
    bytesPerPlayer: playerCount ? addedBytes / playerCount : null,
    gap: Math.max(
      0,
      addedBytes - (recordsMode ? PERSISTED_BUDGET.records : PERSISTED_BUDGET.squads),
    ),
    rows,
  };
  const output = JSON.stringify(result, null, 2) + '\n';
  if (out) writeFileSync(out, output);
  console.log(output);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
