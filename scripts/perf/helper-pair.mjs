import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

if (!isMainThread) {
  const api = await import(pathToFileURL(workerData.bundle).href);
  api.serve(parentPort);
  parentPort.postMessage({ ready: true });
} else {
  const [base, candidate, seed, daysArg, warmArg, first] = process.argv.slice(2);
  const order = first === 'AB' ? [0, 1] : [1, 0],
    sides = [];
  const startup = performance.now();
  try {
    for (const i of order) {
      const file = [base, candidate][i],
        api = await import(pathToFileURL(file).href),
        workers = [];
      const ports = await Promise.all(
        Array.from(
          { length: 2 },
          () =>
            new Promise((resolve, reject) => {
              const worker = new Worker(new URL(import.meta.url), { workerData: { bundle: file } });
              workers.push(worker);
              const port = { onmessage: null, postMessage: (job) => worker.postMessage(job) };
              worker.once('error', reject);
              worker.once('message', () => {
                worker.off('error', reject);
                worker.on('message', (data) => port.onmessage?.({ data }));
                resolve(port);
              });
            }),
        ),
      );
      sides[i] = { api, world: api.found(seed), pool: new api.HelperPool(ports), workers };
    }
    const startupMs = performance.now() - startup,
      pairs = [];
    const clocks = () => {
      const p = process.cpuUsage(),
        t = process.threadCpuUsage();
      return {
        process: (p.user + p.system) / 1000,
        main: (t.user + t.system) / 1000,
        wall: performance.now(),
      };
    };
    async function timed(i) {
      const s = sides[i],
        start = clocks(),
        label = await s.api.day(s.world, s.pool),
        end = clocks();
      if (!s.pool.active)
        throw new Error('Benchmark helper failed: serial fallback cannot count as helper evidence');
      return {
        label,
        wall: end.wall - start.wall,
        process: end.process - start.process,
        main: end.main - start.main,
      };
    }
    const warm = Number(warmArg),
      days = Number(daysArg);
    for (let d = 0; d < warm + days; d++) {
      const order = (d % 2 === 0) === (first === 'AB') ? [0, 1] : [1, 0],
        out = [];
      for (const i of order) out[i] = await timed(i);
      if (out[0].label !== out[1].label) throw new Error('Helper day labels differ');
      if (d >= warm) pairs.push({ label: out[0].label, a: out[0], b: out[1] });
    }
    const hashes = sides.map((s) =>
      createHash('sha256').update(s.api.canonical(s.world)).digest('hex'),
    );
    if (hashes[0] !== hashes[1]) throw new Error('Helper world hashes differ');
    console.log(JSON.stringify({ pairs, hashes, startupMs, rss: process.memoryUsage().rss }));
  } finally {
    await Promise.all(sides.flatMap((s) => s.workers).map((w) => w.terminate()));
  }
}
