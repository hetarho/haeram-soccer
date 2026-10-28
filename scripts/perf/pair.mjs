/**
 * One process of the paired A/B bench (`ab.mjs`): loads the baseline's and the candidate's
 * workload bundles side by side and alternates their reps, so a load swing on the host lands on
 * both sides of a pair. With `AB`, A loads and builds first and pair i runs A then B when i is
 * even, B then A when odd; `BA` mirrors it.
 *
 *   node pair.mjs <base bundle> <cand bundle> <workload> <seed> <reps> <warm> <AB|BA>
 *
 * Prints one JSON line: per pair the label and each side's main-thread CPU and wall milliseconds,
 * and each side's output hash.
 */
import { pathToFileURL } from 'node:url';

const [baseFile, candFile, workload, seed, repsArg, warmArg, first] = process.argv.slice(2);
const reps = Number(repsArg),
  warm = Number(warmArg);
// The side that runs first also loads and builds first: a fixed load order favoured the second
// side by about 0.6% (measured 261028), so alternating it across processes cancels it.
const loadOrder = first === 'AB' ? [0, 1] : [1, 0];
const modules = [],
  sides = [];
for (const i of loadOrder) modules[i] = await import(pathToFileURL([baseFile, candFile][i]).href);
for (const i of loadOrder) sides[i] = modules[i].workloadOf(workload, seed);
const cpuMs = modules[0].cpuMs;

function time(side, record) {
  const w0 = performance.now(),
    c0 = cpuMs();
  const label = sides[side].rep(record);
  return { label, cpu: cpuMs() - c0, wall: performance.now() - w0 };
}

const pairs = [];
for (let i = 0; i < warm + reps; i++) {
  const order = (i % 2 === 0) === (first === 'AB') ? [0, 1] : [1, 0];
  const out = [];
  for (const side of order) out[side] = time(side, i >= warm && i < warm + sides[side].cycle);
  if (out[0].label !== out[1].label)
    throw new Error(`pair ${i}: ${out[0].label} vs ${out[1].label}`);
  if (i >= warm)
    pairs.push({
      label: out[0].label,
      a: { cpu: out[0].cpu, wall: out[0].wall },
      b: { cpu: out[1].cpu, wall: out[1].wall },
    });
}
console.log(JSON.stringify({ pairs, hashes: [sides[0].digest(), sides[1].digest()] }));
