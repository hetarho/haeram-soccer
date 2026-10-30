/** Strict f64x2 portable-hypot probe: kernel and AoS→SoA packing costs, never a match-speed claim. */
import { hypot } from '../../../packages/engine/src/portable-math.ts';
import { median, verdict } from '../../../scripts/perf/stats.ts';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadavg } from 'node:os';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const leb = (x) => {
  const a = [];
  do {
    let b = x & 127;
    x >>>= 7;
    if (x) b |= 128;
    a.push(b);
  } while (x);
  return a;
};
const section = (id, data) => [id, ...leb(data.length), ...data];
const str = (s) => [s.length, ...Buffer.from(s)];
const get = (n) => [0x20, n],
  set = (n) => [0x21, n];
const simd = (n) => [0xfd, ...leb(n)];
const addr = [...get(1), 0x41, 3, 0x74];
const load = (offset) => [...addr, ...simd(0), 4, ...leb(offset)];
const body = [
  2,
  1,
  0x7f,
  5,
  0x7b, // i32 i; v128 a,b,max,p,q
  0x41,
  0,
  ...set(1),
  0x02,
  0x40,
  0x03,
  0x40,
  ...get(1),
  ...get(0),
  0x4f,
  0x0d,
  1,
  ...load(0),
  ...simd(0xec),
  ...set(2),
  ...load(32768),
  ...simd(0xec),
  ...set(3),
  ...get(2),
  ...get(3),
  ...simd(0xf5),
  ...set(4),
  ...get(2),
  ...get(4),
  ...simd(0xf3),
  ...set(5),
  ...get(3),
  ...get(4),
  ...simd(0xf3),
  ...set(6),
  ...addr,
  ...get(5),
  ...get(5),
  ...simd(0xf2),
  ...get(6),
  ...get(6),
  ...simd(0xf2),
  ...simd(0xf0),
  ...simd(0xef),
  ...get(4),
  ...simd(0xf2),
  ...get(4),
  ...simd(0x0c),
  ...Array(16).fill(0),
  ...simd(0x47),
  ...simd(0x4f),
  ...simd(0x0b),
  4,
  ...leb(65536),
  ...get(1),
  0x41,
  2,
  0x6a,
  ...set(1),
  0x0c,
  0,
  0x0b,
  0x0b,
  0x0b,
];
const bytes = new Uint8Array([
  0,
  97,
  115,
  109,
  1,
  0,
  0,
  0,
  ...section(1, [1, 0x60, 1, 0x7f, 0]),
  ...section(3, [1, 0]),
  ...section(5, [1, 0, 2]),
  ...section(7, [2, ...str('run'), 0, 0, ...str('memory'), 2, 0]),
  ...section(10, [1, ...leb(body.length), ...body]),
]);
assert(WebAssembly.validate(bytes), 'strict SIMD module validates');
const { run, memory } = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
const x = new Float64Array(memory.buffer, 0, 4096),
  y = new Float64Array(memory.buffer, 32768, 4096),
  out = new Float64Array(memory.buffer, 65536, 4096);
const inputX = new Float64Array(4096),
  inputY = new Float64Array(4096),
  expected = new Float64Array(4096);
let state = 12345;
const rand = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
};
const objects = [];
for (let i = 0; i < 4096; i++) {
  inputX[i] = i === 0 ? 0 : (rand() - 0.5) * 210;
  inputY[i] = i === 0 ? 0 : (rand() - 0.5) * 136;
  objects.push({ pos: [inputX[i], inputY[i]] });
  expected[i] = hypot(inputX[i], inputY[i]);
}
x.set(inputX);
y.set(inputY);
run(4096);
for (let i = 0; i < 4096; i++)
  assert(Object.is(out[i], expected[i]), `finite pitch vector ${i} must match portable hypot bits`);

const cpu = () => {
  const t = process.threadCpuUsage();
  return (t.user + t.system) / 1000;
};
let sink = 0;
if (process.argv[2] === 'emit') {
  writeFileSync(join(here, 'hypot.wasm'), bytes);
} else if (process.argv[2] === 'case') {
  const count = Number(process.argv[3]),
    packing = process.argv[4] === 'pack';
  const loops = Math.ceil(2e6 / count);
  const jsOut = new Float64Array(count);
  const js = () => {
    for (let batch = 0; batch < loops; batch++) {
      for (let i = 0; i < count; i++)
        jsOut[i] = packing
          ? hypot(objects[i].pos[0], objects[i].pos[1])
          : hypot(inputX[i], inputY[i]);
      sink += jsOut[batch % count];
    }
  };
  const wasm = () => {
    for (let batch = 0; batch < loops; batch++) {
      if (packing)
        for (let i = 0; i < count; i++) {
          x[i] = objects[i].pos[0];
          y[i] = objects[i].pos[1];
        }
      run(count);
      sink += out[batch % count];
    }
  };
  const time = (fn) => {
    const c0 = cpu(),
      t0 = performance.now();
    fn();
    return { cpu: cpu() - c0, wall: performance.now() - t0 };
  };
  const pairs = [];
  const first = Number(process.argv[5]);
  for (let i = 0; i < 14; i++) {
    let a, b;
    if ((i + first) % 2) {
      b = time(wasm);
      a = time(js);
    } else {
      a = time(js);
      b = time(wasm);
    }
    if (i >= 4) pairs.push({ a, b });
  }
  assert(Number.isFinite(sink));
  console.log(JSON.stringify({ pairs, load: loadavg()[0], sameBits: true, sink }));
} else {
  const summaries = [];
  for (const count of [22, 128, 4096])
    for (const packing of ['resident', 'pack']) {
      const runs = [];
      for (let p = 0; p < 8; p++) {
        const r = spawnSync(
          process.execPath,
          [fileURLToPath(import.meta.url), 'case', count, packing, p % 2],
          { encoding: 'utf8', maxBuffer: 1 << 22 },
        );
        if (r.status !== 0) throw new Error(r.stderr);
        runs.push(JSON.parse(r.stdout));
      }
      const summary = {
        count,
        packing,
        processes: runs.length,
        pairs: runs.flatMap((r) => r.pairs).length,
        cpu: verdict(runs.map((r) => median(r.pairs.map((p) => Math.log(p.b.cpu / p.a.cpu))))),
        sameFinitePitchBits: true,
        productionIntegrated: false,
        loads: runs.map((r) => r.load),
      };
      summaries.push(summary);
      console.log(JSON.stringify(summary));
      writeFileSync(
        join(here, `simd-${count}-${packing}.json`),
        JSON.stringify({ summary, runs }, null, 2),
      );
    }
  writeFileSync(join(here, 'simd-summary.json'), JSON.stringify(summaries, null, 2));
}
