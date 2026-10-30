import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, '../../..'),
  scratch = join(root, '.tmp/eo30-motion');
mkdirSync(scratch, { recursive: true });
const outfile = join(scratch, 'oracle.mjs');
await build({
  absWorkingDir: root,
  stdin: {
    contents: `export {stepToward,GRID_MOVEMENT_CONFIG as C} from './packages/engine/src/grid/movement'; export {cos,sin} from './packages/engine/src/portable-math'; export {PITCH} from './packages/engine/src/grid/pitch';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'error',
  banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
});
const { stepToward, C, cos, sin, PITCH } = await import(pathToFileURL(outfile).href);
const { step, memory } = new WebAssembly.Instance(
  new WebAssembly.Module(readFileSync(join(here, 'movement.wasm'))),
).exports;
const data = new Float64Array(memory.buffer);
let state = 78417;
const rand = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
};
let checks = 0;
for (let group = 0; group < 128; group++) {
  const movers = Array.from({ length: 32 }, (_, i) => {
    const pos = [rand() * PITCH.length, rand() * PITCH.width],
      vel = [(rand() - 0.5) * 15, (rand() - 0.5) * 15],
      to = [rand() * PITCH.length, rand() * PITCH.width];
    if (i % 8 === 0) {
      to[0] = pos[0];
      to[1] = pos[1];
      vel[0] = vel[1] = -0;
    }
    if (i % 8 === 1) {
      to[0] = pos[0];
      to[1] = pos[1];
    }
    if (i % 8 === 2) {
      to[0] = pos[0] + 0.001;
      to[1] = pos[1];
      vel[0] = 0.001;
      vel[1] = 0;
    }
    if (i % 8 === 3) {
      vel[0] = vel[1] = 0;
    }
    const hold = [pos[0], pos[1]],
      until = i % 3 === 0 ? 0.4 : 0,
      vmax = 1 + rand() * 8;
    data.set([...pos, ...vel, ...to, ...hold, vmax, until], i * 10);
    return { pos, vel, to, hold, until, vmax };
  });
  let t = 0;
  for (const h of [0.2, 0.2, 0.06, 0.19999999, 0.0001]) {
    const turn = C.turn * (Math.PI / 180) * h;
    step(
      movers.length,
      h,
      t,
      cos(turn),
      sin(turn),
      C.acceleration,
      C.braking,
      C.arrive,
      PITCH.length,
      PITCH.width,
      C.step,
    );
    for (const [i, m] of movers.entries()) {
      stepToward(m, t + 1e-9 < m.until ? m.hold : m.to, m.vmax, h);
      for (const [at, expected] of [...m.pos, ...m.vel].entries()) {
        assert(
          Object.is(data[i * 10 + at], expected),
          `group ${group} mover ${i} h ${h} field ${at}: ${data[i * 10 + at]} != ${expected}`,
        );
        checks++;
      }
    }
    t += h;
  }
}
const result = {
  checks,
  passed: true,
  includes: [
    'standing',
    'signed zero',
    'arrive',
    'turn',
    'brake',
    'snap',
    'holdUntil',
    'fractional steps',
    'pitch bounds',
  ],
};
writeFileSync(join(here, 'movement-parity.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
