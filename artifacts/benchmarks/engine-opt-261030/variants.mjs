/** Isolated engine prototypes. Run prepare, screen, or confirm <variant> [workload]. */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, availableParallelism, totalmem } from 'node:os';

const out = dirname(fileURLToPath(import.meta.url));
const root = resolve(out, '../../..');
const scratch = join(root, '.tmp/eo30-variants');
const baseline = '64005ff137d63ba2540aa26ba12a7f4f12a695fb';
const part = 'packages/engine/src/aggregate/participation.ts';
const players = 'packages/engine/src/aggregate/players.ts';
const team = 'packages/engine/src/aggregate/team.ts';
const primitive = 'packages/engine/src/primitives.ts';

function replace(text, before, after) {
  if (!text.includes(before)) throw new Error(`Missing transform: ${before.slice(0, 100)}`);
  return text.replace(before, after);
}
function edit(dir, file, transform) {
  const path = join(dir, file);
  writeFileSync(path, transform(readFileSync(path, 'utf8')));
}

const inverse = `  const ratio = p / (1 - p),
    u = r();
  let k = 0,
    pk = noneOf(1 - p, n),
    cdf = pk;
  while (u > cdf && k < n) {
    pk *= ((n - k) / (k + 1)) * ratio;
    k++;
    cdf += pk;
  }
  return k;`;

const cachedInverse = `
// Prototype only: bounded lazy inverse-CDF tables, same floating operations and uniform draw.
const inverseCache = new Map<number, Map<number, { cdf: number[]; pk: number }>>();
let inverseEntries = 0;
export function cachedBinomial(r: Rng, n: number, p: number): number {
  const u = r(), ratio = p / (1 - p);
  let byP = inverseCache.get(n);
  let entry = byP?.get(p);
  if (!entry) {
    if (inverseEntries >= 8192) { inverseCache.clear(); inverseEntries = 0; byP = undefined; }
    if (!byP) inverseCache.set(n, byP = new Map());
    const pk = noneOf(1 - p, n);
    byP.set(p, entry = { cdf: [pk], pk });
    inverseEntries++;
  }
  const cdf = entry.cdf;
  let k = cdf.length - 1;
  while (u > cdf[k]! && k < n) {
    entry.pk *= ((n - k) / (k + 1)) * ratio;
    k++;
    cdf.push(cdf[k - 1]! + entry.pk);
  }
  let lo = 0, hi = k;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (u > cdf[mid]!) lo = mid + 1; else hi = mid;
  }
  return lo;
}
`;

const sparseCode = `
// Registered only after SideLines finishes an immutable role/taker distribution.
const distributions = new WeakMap<object, { indices: number[]; total: number; alias?: { q: number[]; to: number[] } }>();
export function registerWeights(weights: number[]) {
  let total = 0;
  const indices: number[] = [];
  for (let i = 0; i < weights.length; i++) if (weights[i]! > 0) { total += weights[i]!; indices.push(i); }
  distributions.set(weights, { indices, total });
}
function sparseSplit(r: Rng, n: number, weights: ArrayLike<number>, out: number[], meta: NonNullable<ReturnType<typeof distributions.get>>) {
  out.fill(0);
  const { indices } = meta;
  let rest = meta.total;
  if (n <= 0 || !indices.length) return out;
  if (n <= indices.length) {
    for (let k = 0; k < n; k++) {
      let u = r() * rest, chosen = indices[indices.length - 1]!;
      for (let at = 0; at < indices.length - 1; at++) {
        const i = indices[at]!;
        if ((u -= weights[i]!) < 0) { chosen = i; break; }
      }
      out[chosen]!++;
    }
    return out;
  }
  let left = n;
  for (let at = 0; at < indices.length && left > 0; at++) {
    const i = indices[at]!, w = weights[i]!;
    const k = at === indices.length - 1 || w >= rest ? left : binomialDraw(r, left, w / rest);
    out[i] = k; left -= k; rest -= w;
  }
  return out;
}
`;

function sparse(dir, alias = false) {
  edit(
    dir,
    part,
    (s) =>
      replace(
        s,
        '  let rest = 0,\n    positive = 0,',
        `  const meta = distributions.get(weights);\n  if (meta) return sparseSplit(r, n, weights, out, meta);\n  let rest = 0,\n    positive = 0,`,
      ) + sparseCode,
  );
  edit(dir, players, (s) => s + `\nimport { registerWeights } from './participation';\n`);
  edit(dir, players, (s) =>
    replace(
      s,
      '      cache[role.id] = out;',
      '      registerWeights(out);\n      cache[role.id] = out;',
    ),
  );
  edit(dir, players, (s) =>
    replace(
      s,
      '      cache.set(key, out);',
      '      registerWeights(out);\n      cache.set(key, out);',
    ),
  );
  if (alias)
    edit(dir, part, (s) =>
      replace(
        s,
        `    for (let k = 0; k < n; k++) {
      let u = r() * rest, chosen = indices[indices.length - 1]!;
      for (let at = 0; at < indices.length - 1; at++) {
        const i = indices[at]!;
        if ((u -= weights[i]!) < 0) { chosen = i; break; }
      }
      out[chosen]!++;
    }`,
        `    let table = meta.alias;
    if (!table) {
      const size = indices.length, q = indices.map(i => weights[i]! * size / rest), to = indices.map((_, i) => i);
      const small: number[] = [], large: number[] = [];
      for (let i = 0; i < size; i++) (q[i]! < 1 ? small : large).push(i);
      while (small.length && large.length) {
        const a = small.pop()!, b = large.pop()!;
        to[a] = b; q[b] = q[b]! + q[a]! - 1;
        (q[b]! < 1 ? small : large).push(b);
      }
      for (const i of [...small, ...large]) q[i] = 1;
      meta.alias = table = { q, to };
    }
    for (let k = 0; k < n; k++) {
      const u = r() * indices.length, at = Math.floor(u);
      out[indices[u - at < table.q[at]! ? at : table.to[at]!]!]!++;
    }`,
      ),
    );
}

// A small, dependency-free Wasm xorshift32 kernel; integer instructions preserve the RNG exactly.
const leb = (x) => {
  const out = [];
  do {
    let b = x & 127;
    x >>>= 7;
    if (x) b |= 128;
    out.push(b);
  } while (x);
  return out;
};
const section = (id, bytes) => [id, ...leb(bytes.length), ...bytes];
const str = (s) => [s.length, ...Buffer.from(s)];
const xorShift = [
  0x20, 0, 0x20, 0, 0x41, 13, 0x74, 0x73, 0x21, 0, 0x20, 0, 0x20, 0, 0x41, 17, 0x76, 0x73, 0x21, 0,
  0x20, 0, 0x20, 0, 0x41, 5, 0x74, 0x73, 0x21, 0,
];
function wasmBytes() {
  // next(i32)->i32, fill(i32 state,i32 length)->i32; fill writes uint32s to exported memory.
  const next = [0, ...xorShift, 0x20, 0, 0x0b];
  const fill = [
    1,
    1,
    0x7f,
    0x41,
    0,
    0x21,
    2,
    0x02,
    0x40,
    0x03,
    0x40,
    0x20,
    2,
    0x20,
    1,
    0x4f,
    0x0d,
    1,
    ...xorShift,
    0x20,
    2,
    0x41,
    2,
    0x74,
    0x20,
    0,
    0x36,
    2,
    0,
    0x20,
    2,
    0x41,
    1,
    0x6a,
    0x21,
    2,
    0x0c,
    0,
    0x0b,
    0x0b,
    0x20,
    0,
    0x0b,
  ];
  return [
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    ...section(1, [2, 0x60, 1, 0x7f, 1, 0x7f, 0x60, 2, 0x7f, 0x7f, 1, 0x7f]),
    ...section(3, [2, 0, 1]),
    ...section(5, [1, 0, 1]),
    ...section(7, [3, ...str('next'), 0, 0, ...str('fill'), 0, 1, ...str('memory'), 2, 0]),
    ...section(10, [2, ...leb(next.length), ...next, ...leb(fill.length), ...fill]),
  ];
}
const wasm = wasmBytes();
if (!WebAssembly.validate(new Uint8Array(wasm))) throw new Error('invalid Wasm prototype');
const wasmInit = `\nconst wasmRng = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(${JSON.stringify(wasm)}))).exports;\n`;
const randomOld = `  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };`;

const variants = {
  'grid-wasm-phase': (dir) =>
    edit(dir, 'packages/engine/src/grid/movement.ts', (s) => {
      s = replace(
        s,
        '  const whole = Math.floor(dt / C.step + 1e-9);',
        `  if (!onStep && movers.length > 0 && movers.length <= 819) {
    for (let k = 0; k < movers.length; k++) {
      const m = movers[k]!, at = k * 10;
      phaseData[at] = m.gp.pos[0]; phaseData[at+1] = m.gp.pos[1];
      phaseData[at+2] = m.gp.vel?.[0] ?? 0; phaseData[at+3] = m.gp.vel?.[1] ?? 0;
      phaseData[at+4] = m.to[0]; phaseData[at+5] = m.to[1];
      phaseData[at+6] = m.hold[0]; phaseData[at+7] = m.hold[1];
      phaseData[at+8] = m.vmax; phaseData[at+9] = m.holdUntil;
    }
    const whole = Math.floor(dt / C.step + 1e-9), rest = dt - whole * C.step;
    let stepped = false;
    for (let i = 0; i <= whole; i++) {
      const h = i < whole ? C.step : rest;
      if (h <= 1e-9) break;
      stepped = true;
      const full = h === C.step, turn = full ? FULL_TURN : C.turn * RAD * h;
      phaseStep(movers.length, h, i*C.step, full ? FULL_COS : cos(turn), full ? FULL_SIN : sin(turn), C.acceleration, C.braking, C.arrive, PITCH.length, PITCH.width, C.step);
    }
    if (stepped) for (let k = 0; k < movers.length; k++) {
      const gp = movers[k]!.gp, at = k*10;
      gp.pos[0] = phaseData[at]!; gp.pos[1] = phaseData[at+1]!;
      const v = gp.vel ??= [0,0]; v[0] = phaseData[at+2]!; v[1] = phaseData[at+3]!;
    }
    return;
  }
  const whole = Math.floor(dt / C.step + 1e-9);`,
      );
      return (
        s +
        `\nconst phaseExports = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(${JSON.stringify([...readFileSync(join(out, 'movement.wasm'))])}))).exports;
const phaseStep = phaseExports.step as (count: number, h: number, t: number, c: number, s: number, acc: number, brake: number, arrive: number, length: number, width: number, step: number) => void;
const phaseData = new Float64Array((phaseExports.memory as WebAssembly.Memory).buffer);\n`
      );
    }),
  'grid-simd-hypot': (dir) =>
    edit(dir, 'packages/engine/src/grid/movement.ts', (s) => {
      const start = s.indexOf('export function stepToward(');
      const end = s.indexOf('\n}\n', start) + 3;
      let specialized = s.slice(start, end);
      specialized = replace(
        specialized,
        'export function stepToward(',
        'function stepTowardBatch(',
      );
      specialized = replace(
        specialized,
        'vmax: number, h: number)',
        'vmax: number, h: number, dist: number, speed: number)',
      );
      specialized = replace(specialized, '  const dist = hypot(dx, dy);', '');
      specialized = replace(
        specialized,
        '  const speed = v[0] === 0 && v[1] === 0 ? 0 : hypot(v[0], v[1]);',
        '',
      );
      s = replace(
        s,
        `    for (let k = 0; k < movers.length; k++) {
      const m = movers[k]!;
      stepToward(m.gp, t + 1e-9 < m.holdUntil ? m.hold : m.to, m.vmax, h);
    }`,
        `    for (let k = 0; k < movers.length; k++) {
      const m = movers[k]!, target = t + 1e-9 < m.holdUntil ? m.hold : m.to;
      batchX[2*k] = target[0] - m.gp.pos[0]; batchY[2*k] = target[1] - m.gp.pos[1];
      batchX[2*k+1] = m.gp.vel?.[0] ?? 0; batchY[2*k+1] = m.gp.vel?.[1] ?? 0;
    }
    batchRun(movers.length * 2);
    for (let k = 0; k < movers.length; k++) {
      const m = movers[k]!;
      stepTowardBatch(m.gp, t + 1e-9 < m.holdUntil ? m.hold : m.to, m.vmax, h, batchOut[2*k]!, batchOut[2*k+1]!);
    }`,
      );
      return (
        s +
        '\n' +
        specialized +
        `\nconst batchExports = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(${JSON.stringify([...readFileSync(join(out, 'hypot.wasm'))])}))).exports;
const batchRun = batchExports.run as (n: number) => void;
const batchMemory = (batchExports.memory as WebAssembly.Memory).buffer;
const batchX = new Float64Array(batchMemory, 0, 4096), batchY = new Float64Array(batchMemory, 32768, 4096), batchOut = new Float64Array(batchMemory, 65536, 4096);\n`
      );
    }),
  'float64-scratch': (dir) =>
    edit(dir, players, (s) => s.replaceAll('Array<number>(n).fill(0)', 'new Float64Array(n)')),
  'int32-scratch': (dir) =>
    edit(dir, players, (s) => s.replaceAll('Array<number>(n).fill(0)', 'new Int32Array(n)')),
  'cdf-cache': (dir) => {
    edit(
      dir,
      part,
      (s) => replace(s, inverse, '  return cachedBinomial(r, n, p);') + cachedInverse,
    );
    edit(dir, team, (s) =>
      replace(
        replace(
          s,
          "import { noneOf } from './participation';",
          "import { noneOf, cachedBinomial } from './participation';",
        ),
        inverse,
        '  return cachedBinomial(r, n, p);',
      ),
    );
  },
  'sparse-weights': (dir) => sparse(dir),
  'alias-model-change': (dir) => sparse(dir, true),
  'wasm-scalar-rng': (dir) =>
    edit(
      dir,
      primitive,
      (s) =>
        replace(
          s,
          randomOld,
          `  return () => { state = (wasmRng.next as (s: number) => number)(state); return (state >>> 0) / 4294967296; };`,
        ) + wasmInit,
    ),
  'wasm-buffered-rng': (dir) =>
    edit(
      dir,
      primitive,
      (s) =>
        replace(
          s,
          randomOld,
          `  const buffer = new Uint32Array(64); let at = buffer.length;
  return () => {
    if (at === buffer.length) {
      state = (wasmRng.fill as (s: number, n: number) => number)(state, buffer.length);
      buffer.set(new Uint32Array((wasmRng.memory as WebAssembly.Memory).buffer, 0, buffer.length)); at = 0;
    }
    return buffer[at++]! / 4294967296;
  };`,
        ) + wasmInit,
    ),
};

function prepare() {
  mkdirSync(scratch, { recursive: true });
  const identity = {
    baseline,
    node: process.version,
    v8: process.versions.v8,
    cpu: cpus()[0].model,
    cores: availableParallelism(),
    memory: totalmem(),
    harness: createHash('sha256')
      .update(readFileSync(fileURLToPath(import.meta.url)))
      .digest('hex'),
  };
  writeFileSync(join(out, 'environment.json'), JSON.stringify(identity, null, 2));
  for (const [name, transform] of Object.entries(variants)) {
    const dir = join(scratch, name);
    mkdirSync(dir, { recursive: true });
    cpSync(join(root, 'packages'), join(dir, 'packages'), { recursive: true });
    transform(dir);
    const diff = spawnSync(
      'git',
      ['diff', '--no-index', '--', join(root, 'packages'), join(dir, 'packages')],
      { encoding: 'utf8', maxBuffer: 1 << 24 },
    );
    if (diff.status !== 1) throw new Error(`No diff or diff failed: ${name}`);
    const patch = diff.stdout
      .replaceAll('a' + join(root, 'packages') + '/', 'a/packages/')
      .replaceAll('b' + join(dir, 'packages') + '/', 'b/packages/');
    writeFileSync(join(out, `${name}.patch`), patch);
  }
}

function measure(name, workload, full = false) {
  const file = join(out, `${full ? 'confirm' : 'screen'}-${name}-${workload}.json`);
  const args = [
    'scripts/perf/ab.mjs',
    '--base',
    baseline,
    '--cand',
    join(scratch, name),
    '--workload',
    workload,
    '--json',
    file,
  ];
  if (!full) args.push('--procs', '4', '--reps', '8', '--warm', '4');
  const run = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 24,
  });
  writeFileSync(file + '.log', run.stderr + '\n' + run.stdout);
  if (run.status !== 0) throw new Error(`${name}: ${run.stderr}`);
  const r = JSON.parse(readFileSync(file, 'utf8'));
  console.log(
    JSON.stringify({
      name,
      workload,
      full,
      hash: r.sameHash,
      cpu: r[workload]?.cpu ?? { own: r.own?.cpu, other: r.other?.cpu },
      load1: r.load1,
    }),
  );
}

const [action, name, workload = 'aggregate'] = process.argv.slice(2);
if (action === 'prepare') prepare();
else if (action === 'screen' && variants[name]) measure(name, workload);
else if (action === 'screen')
  for (const name of Object.keys(variants).filter((n) => !n.startsWith('grid-')))
    measure(name, 'aggregate');
else if (action === 'confirm' && variants[name]) measure(name, workload, true);
else throw new Error('Use prepare | screen | confirm <variant> [aggregate|grid|day]');
