/** Persistent-worker architecture and transport probe, not production worker-topology acceptance. */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadavg } from 'node:os';
import { build } from 'esbuild';
import { median, verdict } from '../../../scripts/perf/stats.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..'),
  scratch = join(root, '.tmp/eo30-workers');
const bundle = join(scratch, 'fixture-api.mjs');
const cpu = () => {
  const x = process.threadCpuUsage();
  return (x.user + x.system) / 1000;
};
const processCpu = () => {
  const x = process.cpuUsage();
  return (x.user + x.system) / 1000;
};

if (!isMainThread) {
  const { simulateRoundJob, invalidateNpcSquads } = await import(
    pathToFileURL(workerData.bundle).href
  );
  let resident;
  parentPort.on('message', ({ copy, jobs, init, update, epochChanged, patch }) => {
    const c0 = cpu();
    try {
      if (copy instanceof ArrayBuffer) copy = new TextDecoder().decode(copy);
      if (typeof copy === 'string') copy = JSON.parse(copy);
      if (init) {
        resident = copy;
        parentPort.postMessage({ ready: true });
        return;
      }
      if (update) {
        Object.assign(resident, copy);
        if (epochChanged) invalidateNpcSquads(resident);
        copy = resident;
      }
      if (patch) {
        Object.assign(resident, patch.dynamic);
        const clubs = new Map(resident.clubs.map((c) => [c.id, c]));
        for (const changed of patch.clubs) {
          const current = clubs.get(changed.id);
          if (current) {
            for (const key of Object.keys(current)) if (!(key in changed)) delete current[key];
            Object.assign(current, changed);
          } else clubs.set(changed.id, changed);
        }
        if (patch.clubOrder) resident.clubs = patch.clubOrder.map((id) => clubs.get(id));
        if (patch.people.length || patch.peopleDeleted.length || patch.peopleOrder) {
          const registry = { ...resident.people };
          for (const id of patch.peopleDeleted) delete registry[id];
          for (const person of patch.people) registry[person.id] = person;
          resident.people = patch.peopleOrder
            ? Object.fromEntries(patch.peopleOrder.map((id) => [id, registry[id]]))
            : registry;
        }
        if (patch.rosterChanged) invalidateNpcSquads(resident);
        copy = resident;
      }
      const results = jobs.map((job) => simulateRoundJob(copy ?? resident, job));
      parentPort.postMessage({ results, cpu: cpu() - c0 });
    } catch (e) {
      parentPort.postMessage({ error: String(e.stack ?? e) });
    }
  });
  parentPort.postMessage({ ready: true });
} else if (process.argv[2] === 'case') {
  const [countArg, workersArg, mode, orderArg] = process.argv.slice(3);
  const count = Number(countArg),
    width = Number(workersArg),
    first = Number(orderArg);
  const api = await import(pathToFileURL(bundle).href);
  const { copy, jobs } = api.fixtureInput('perf-261027', count);
  const shares = Array.from({ length: width }, (_, i) =>
    jobs.slice(Math.floor((i * jobs.length) / width), Math.floor(((i + 1) * jobs.length) / width)),
  );
  const ask = (worker, value, transfer) =>
    new Promise((resolve, reject) => {
      const ok = (value) => {
        worker.off('error', fail);
        if (value.error) reject(new Error(value.error));
        else resolve(value);
      };
      const fail = (error) => {
        worker.off('message', ok);
        reject(error);
      };
      worker.once('message', ok);
      worker.once('error', fail);
      worker.postMessage(value, transfer);
    });
  const cold0 = performance.now();
  const pool = await Promise.all(
    Array.from(
      { length: width },
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { bundle } });
          worker.once('message', () => {
            worker.off('error', reject);
            resolve(worker);
          });
          worker.once('error', reject);
        }),
    ),
  );
  const startupMs = performance.now() - cold0;
  const resident0 = performance.now();
  if (mode === 'resident' || mode === 'delta')
    await Promise.all(
      pool.map((worker, i) =>
        ask(worker, { init: true, copy: mode === 'delta' ? copy : api.shardCopy(copy, shares[i]) }),
      ),
    );
  const residentInitMs =
    mode === 'resident' || mode === 'delta' ? performance.now() - resident0 : 0;
  let epoch = JSON.stringify([copy.seed, copy.year, copy.clubs, copy.people]);
  const payloadBytes = Buffer.byteLength(JSON.stringify(copy));
  const shardBytes = shares.map((share) =>
    Buffer.byteLength(JSON.stringify(api.shardCopy(copy, share))),
  );
  const slimBytes = shares.map((share) =>
    Buffer.byteLength(JSON.stringify(api.slimCopy(copy, share))),
  );
  function serial() {
    const t0 = performance.now(),
      c0 = processCpu();
    const results = jobs.map((job) => api.simulateRoundJob(copy, job));
    return { results, wall: performance.now() - t0, cpu: processCpu() - c0 };
  }
  async function parallel() {
    const t0 = performance.now(),
      c0 = processCpu();
    // Include sharding, JSON/string encoding, IPC and full result materialization in the wall time.
    const fullText = mode === 'json-full' ? JSON.stringify(copy) : undefined;
    const nextEpoch =
      mode === 'delta'
        ? JSON.stringify([copy.seed, copy.year, copy.clubs, copy.people])
        : undefined;
    const changed = mode === 'delta' && nextEpoch !== epoch;
    if (mode === 'delta') epoch = nextEpoch;
    const answers = await Promise.all(
      pool.map((worker, i) => {
        let value;
        if (mode === 'resident') value = undefined;
        else if (mode === 'delta') {
          const { clubs, people, ...dynamic } = copy;
          void clubs;
          void people;
          value = changed ? copy : dynamic;
        } else if (mode === 'json-full') value = fullText;
        else if (mode === 'clone-full') value = copy;
        else if (mode === 'json-slim') value = JSON.stringify(api.slimCopy(copy, shares[i]));
        else {
          const slice = api.shardCopy(copy, shares[i]);
          value =
            mode === 'json-shard'
              ? JSON.stringify(slice)
              : new TextEncoder().encode(JSON.stringify(slice)).buffer;
        }
        return ask(
          worker,
          { copy: value, jobs: shares[i], update: mode === 'delta', epochChanged: changed },
          value instanceof ArrayBuffer ? [value] : undefined,
        );
      }),
    );
    const results = answers.flatMap((a) => a.results);
    return { results, wall: performance.now() - t0, cpu: processCpu() - c0 };
  }
  const pairs = [],
    hashes = new Set(),
    loads = [loadavg()[0]];
  let cold;
  try {
    for (let i = 0; i < 10; i++) {
      let a, b;
      if ((i + first) % 2) {
        b = await parallel();
        a = serial();
      } else {
        a = serial();
        b = await parallel();
      }
      const ha = api.digest(a.results),
        hb = api.digest(b.results);
      if (ha !== hb) throw new Error(`Result mismatch ${mode}: ${ha} != ${hb}`);
      hashes.add(ha);
      if (i === 0) cold = { serial: a.wall, parallel: b.wall };
      if (i >= 2)
        pairs.push({
          serial: { wall: a.wall, cpu: a.cpu },
          parallel: { wall: b.wall, cpu: b.cpu },
        });
      loads.push(loadavg()[0]);
    }
    console.log(
      JSON.stringify({
        count: jobs.length,
        workers: width,
        mode,
        startupMs,
        residentInitMs,
        cold,
        payloadBytes,
        shardBytes,
        slimBytes,
        pairs,
        hashes: [...hashes],
        sameHash: true,
        rss: process.memoryUsage().rss,
        loads,
      }),
    );
  } finally {
    await Promise.all(pool.map((worker) => worker.terminate()));
  }
} else {
  mkdirSync(scratch, { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: [join(here, 'fixture-api.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
  });
  const cases =
    process.argv[2] === 'slim'
      ? [
          [8, 2, 'json-slim'],
          [64, 2, 'json-slim'],
          [64, 4, 'json-slim'],
          [8, 2, 'delta'],
          [64, 2, 'delta'],
          [256, 2, 'delta'],
          [256, 4, 'delta'],
        ]
      : [
          [8, 2, 'json-full'],
          [8, 2, 'clone-full'],
          [8, 2, 'json-shard'],
          [8, 2, 'transfer-shard'],
          [64, 2, 'json-full'],
          [64, 2, 'json-shard'],
          [64, 4, 'json-shard'],
          [256, 2, 'json-shard'],
          [256, 4, 'json-shard'],
          [256, 4, 'resident'],
        ];
  const summaries = [];
  for (const [count, width, mode] of cases) {
    const runs = [];
    for (let p = 0; p < 4; p++) {
      const r = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), 'case', count, width, mode, p % 2],
        { cwd: root, encoding: 'utf8', maxBuffer: 1 << 24, timeout: 120000 },
      );
      if (r.status !== 0) throw new Error(r.stderr);
      runs.push(JSON.parse(r.stdout.trim().split('\n').at(-1)));
    }
    const pairs = runs.flatMap((r) => r.pairs);
    const summary = {
      count: runs[0].count,
      workers: width,
      mode,
      pairs: pairs.length,
      wall: verdict(
        runs.map((r) => median(r.pairs.map((p) => Math.log(p.parallel.wall / p.serial.wall)))),
      ),
      totalCpu: verdict(
        runs.map((r) => median(r.pairs.map((p) => Math.log(p.parallel.cpu / p.serial.cpu)))),
      ),
      ms: {
        serial: median(pairs.map((p) => p.serial.wall)),
        parallel: median(pairs.map((p) => p.parallel.wall)),
        startup: median(runs.map((r) => r.startupMs)),
        residentInit: median(runs.map((r) => r.residentInitMs)),
      },
      sameHash: runs.every((r) => r.sameHash),
      hash: runs[0].hashes,
      payloadBytes: runs[0].payloadBytes,
      shardBytes: runs[0].shardBytes,
      slimBytes: runs[0].slimBytes,
      rssMax: Math.max(...runs.map((r) => r.rss)),
      loadRange: [
        Math.min(...runs.flatMap((r) => r.loads)),
        Math.max(...runs.flatMap((r) => r.loads)),
      ],
    };
    writeFileSync(
      join(here, `workers-${count}-${width}-${mode}.json`),
      JSON.stringify({ summary, runs }, null, 2),
    );
    summaries.push(summary);
    console.log(JSON.stringify(summary));
  }
  writeFileSync(
    join(here, process.argv[2] === 'slim' ? 'workers-slim-summary.json' : 'workers-summary.json'),
    JSON.stringify(summaries, null, 2),
  );
}
