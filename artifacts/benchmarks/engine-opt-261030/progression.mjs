/** Real day progression: unchanged single writer + current helpers or resident/delta prototype. */
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadavg } from 'node:os';
import assert from 'node:assert/strict';
import { median, verdict } from '../../../scripts/perf/stats.ts';

const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, '../../..');
const bundle = join(root, '.tmp/eo30-workers/fixture-api.mjs');
const api = await import(pathToFileURL(bundle).href);
const processCpu = () => {
  const x = process.cpuUsage();
  return (x.user + x.system) / 1000;
};

if (process.argv[2] === 'case') {
  const mode = process.argv[3],
    width = Number(process.argv[4]),
    p = Number(process.argv[5]);
  const baseMode = process.argv[6] ?? 'serial';
  const seed = p % 2 ? 'architecture-second-seed' : 'perf-261027';
  const makeWorld = () =>
    api.createWorld(
      { country: 'ENG', name: 'Architecture Research', color: '#284e35', seed, level: 'easy' },
      api.MATCH_MODEL_RELEASE,
    );
  const worlds = [makeWorld(), makeWorld()];
  const start = performance.now();
  const pool = await Promise.all(
    Array.from({ length: width }, async () => {
      const worker = new Worker(join(here, 'workers.mjs'), { workerData: { bundle } });
      await once(worker, 'message');
      return worker;
    }),
  );
  const startupMs = performance.now() - start;
  let epoch,
    changes = 0,
    calls = 0,
    wireBytes = 0;
  let recordState;
  const ask = (worker, value) =>
    new Promise((resolve, reject) => {
      worker.once('message', (answer) =>
        answer.error ? reject(new Error(answer.error)) : resolve(answer.results),
      );
      worker.postMessage(value);
    });
  async function currentHelpers(copy, jobs) {
    const helpers = pool.slice(0, 2),
      text = JSON.stringify(copy);
    const answers = await Promise.all(
      helpers.map((worker, i) =>
        ask(worker, {
          copy: text,
          jobs: jobs.slice(
            Math.floor((i * jobs.length) / 2),
            Math.floor(((i + 1) * jobs.length) / 2),
          ),
        }),
      ),
    );
    return answers.flat();
  }
  async function run(copy, jobs) {
    calls++;
    const shares = pool.map((_, i) =>
      jobs.slice(
        Math.floor((i * jobs.length) / width),
        Math.floor(((i + 1) * jobs.length) / width),
      ),
    );
    if (mode === 'record-delta') {
      const clubTexts = new Map(copy.clubs.map((c) => [c.id, JSON.stringify(c)]));
      const peopleTexts = new Map(
        Object.entries(copy.people ?? {}).map(([id, p]) => [id, JSON.stringify(p)]),
      );
      const clubOrder = JSON.stringify(copy.clubs.map((c) => c.id));
      const peopleOrder = JSON.stringify(Object.keys(copy.people ?? {}));
      // Every continuousSquad/npcSquad input, in registry order. Financial, cohesion and career
      // changes still replicate, without discarding a roster whose generation inputs are fixed.
      const roster = JSON.stringify([
        copy.seed,
        copy.year,
        copy.clubs.map((c) => [c.id, c.country, c.strength, c.tier]),
        Object.values(copy.people ?? {}).map((p) => [
          p.id,
          p.name,
          p.born,
          p.position,
          p.professionalism,
          p.qualities,
          p.origin,
          p.playing,
          p.club,
        ]),
      ]);
      const { clubs, people, ...dynamic } = copy;
      void clubs;
      void people;
      const patch = {
        dynamic,
        clubs: copy.clubs.filter((c) => recordState?.clubTexts.get(c.id) !== clubTexts.get(c.id)),
        people: Object.entries(copy.people ?? {})
          .filter(([id]) => recordState?.peopleTexts.get(id) !== peopleTexts.get(id))
          .map(([, p]) => p),
        peopleDeleted: recordState
          ? [...recordState.peopleTexts.keys()].filter((id) => !peopleTexts.has(id))
          : [],
        clubOrder: recordState?.clubOrder === clubOrder ? undefined : JSON.parse(clubOrder),
        peopleOrder: recordState?.peopleOrder === peopleOrder ? undefined : JSON.parse(peopleOrder),
        rosterChanged: recordState?.roster !== roster,
      };
      if (patch.rosterChanged) changes++;
      if (!recordState)
        await Promise.all(
          pool.map(
            (worker) =>
              new Promise((resolve, reject) => {
                worker.once('message', (answer) =>
                  answer.error ? reject(new Error(answer.error)) : resolve(),
                );
                worker.postMessage({ init: true, copy });
              }),
          ),
        );
      recordState = { clubTexts, peopleTexts, clubOrder, peopleOrder, roster };
      wireBytes += Buffer.byteLength(JSON.stringify(patch)) * width;
      return (
        await Promise.all(pool.map((worker, i) => ask(worker, { patch, jobs: shares[i] })))
      ).flat();
    }
    if (mode === 'delta') {
      const next = JSON.stringify([copy.seed, copy.year, copy.clubs, copy.people]);
      const changed = next !== epoch;
      epoch = next;
      if (changed) changes++;
      const { clubs, people, ...dynamic } = copy;
      void clubs;
      void people;
      const payload = changed ? copy : dynamic;
      wireBytes += Buffer.byteLength(JSON.stringify(payload)) * width;
      if (calls === 1) {
        await Promise.all(
          pool.map(
            (worker) =>
              new Promise((resolve, reject) => {
                worker.once('message', (answer) =>
                  answer.error ? reject(new Error(answer.error)) : resolve(),
                );
                worker.postMessage({ init: true, copy });
              }),
          ),
        );
      }
      return (
        await Promise.all(
          pool.map((worker, i) =>
            ask(worker, { copy: payload, jobs: shares[i], update: true, epochChanged: changed }),
          ),
        )
      ).flat();
    }
    const text = mode === 'json-full' ? JSON.stringify(copy) : undefined;
    return (
      await Promise.all(
        pool.map((worker, i) => {
          const payload = text ?? JSON.stringify(api.slimCopy(copy, shares[i]));
          wireBytes += Buffer.byteLength(payload);
          return ask(worker, { copy: payload, jobs: shares[i] });
        }),
      )
    ).flat();
  }
  const samples = [],
    loads = [loadavg()[0]],
    dayHashes = [];
  try {
    for (let day = 0; day < 120; day++) {
      const result = [];
      for (const side of (day + p) % 2 ? [1, 0] : [0, 1]) {
        const w = worlds[side],
          ownBefore = w.ownMatches.length;
        const t0 = performance.now(),
          c0 = processCpu();
        if (side === 0 && baseMode === 'serial') api.advanceDays(w, 1, undefined, false);
        else {
          let pending;
          if (
            api.prepareRound(
              w,
              (copy, jobs) => {
                pending = side === 0 ? currentHelpers(copy, jobs) : run(copy, jobs);
              },
              false,
            )
          )
            api.completeRound(w, await pending);
          else api.advanceDays(w, 1, undefined, false);
        }
        result[side] = {
          wall: performance.now() - t0,
          cpu: processCpu() - c0,
          own: w.ownMatches.length > ownBefore,
        };
      }
      assert.equal(result[0].own, result[1].own);
      const hashes = worlds.map(api.digest);
      assert.equal(hashes[0], hashes[1], `${mode} day ${day} world parity`);
      dayHashes.push(hashes[0]);
      samples.push({
        day: day + 1,
        kind: result[0].own ? 'own' : 'other',
        a: result[0],
        b: result[1],
      });
    }
    loads.push(loadavg()[0]);
    console.log(
      JSON.stringify({
        mode,
        width,
        baseMode,
        seed,
        startupMs,
        calls,
        changes,
        wireBytes,
        sameHash: true,
        hash: dayHashes.at(-1),
        samples,
        loads,
        rss: process.memoryUsage().rss,
      }),
    );
  } finally {
    await Promise.all(pool.map((w) => w.terminate()));
  }
} else {
  const summaries = [];
  const baseMode = process.argv[2] === 'current' ? 'current' : 'serial';
  for (const [mode, width] of baseMode === 'current'
    ? [
        ['record-delta', 2],
        ['delta', 2],
        ['json-slim', 2],
      ]
    : [
        ['json-full', 2],
        ['json-slim', 2],
        ['delta', 2],
        ['delta', 4],
      ]) {
    const runs = [];
    for (let p = 0; p < 4; p++) {
      const r = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), 'case', mode, width, p, baseMode],
        { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 },
      );
      if (r.status !== 0) throw new Error(r.stderr);
      runs.push(JSON.parse(r.stdout.trim().split('\n').at(-1)));
    }
    const all = runs.flatMap((r) => r.samples);
    const total = (key) =>
      verdict(
        runs.map((r) =>
          Math.log(
            r.samples.reduce((s, p) => s + p.b[key], 0) /
              r.samples.reduce((s, p) => s + p.a[key], 0),
          ),
        ),
      );
    const own = runs.map((r) =>
      median(r.samples.filter((p) => p.kind === 'own').map((p) => Math.log(p.b.wall / p.a.wall))),
    );
    const summary = {
      mode,
      width,
      baseMode,
      processes: 4,
      days: all.length,
      ownDays: all.filter((p) => p.kind === 'own').length,
      wall: total('wall'),
      processCpu: total('cpu'),
      ownWall: verdict(own),
      sameHash: runs.every((r) => r.sameHash),
      hashes: [...new Set(runs.map((r) => r.hash))],
      calls: runs.map((r) => r.calls),
      epochChanges: runs.map((r) => r.changes),
      startupMs: median(runs.map((r) => r.startupMs)),
      rssMax: Math.max(...runs.map((r) => r.rss)),
      loadRange: [
        Math.min(...runs.flatMap((r) => r.loads)),
        Math.max(...runs.flatMap((r) => r.loads)),
      ],
    };
    summaries.push(summary);
    console.log(JSON.stringify(summary));
    writeFileSync(
      join(here, `progression-${baseMode}-${width}-${mode}.json`),
      JSON.stringify({ summary, runs }, null, 2),
    );
  }
  writeFileSync(
    join(here, `progression-${baseMode}-summary.json`),
    JSON.stringify(summaries, null, 2),
  );
}
