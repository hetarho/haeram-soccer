// T939 engine-thread autosave hand-off: the world object's structured clone (the current
// `codec.postMessage({ world })`) against `JSON.stringify` of the world plus the string's clone
// (the text job), timed in interleaved pairs on a stored world.
//
//   node --expose-gc handoff.mjs <world.bin (v8.serialize of a World)> [pairs=15] [out.json]
//
// Each pair runs both hand-offs back to back, alternating which goes first. The reported ratio is
// new / current per pair; its median carries a distribution-free 95% interval from the binomial
// order statistics of the per-pair ratios. Two further pair sets time only what the sending
// thread pays: `v8.serialize` (the serializer postMessage runs before the receiver deserializes)
// and a real `MessagePort.postMessage` call, each against stringify plus the same for the string.
import v8 from 'node:v8';
import fs from 'node:fs';
import path from 'node:path';
import { MessageChannel } from 'node:worker_threads';

const [file, pairsArg, outArg] = process.argv.slice(2);
if (!file) throw new Error('usage: handoff.mjs <world.bin> [pairs] [out.json]');
const PAIRS = Number(pairsArg ?? 15);
const out = outArg ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'handoff.json');
const world = v8.deserialize(fs.readFileSync(file));
const gc = globalThis.gc ?? (() => {});
const now = () => performance.now();
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

// The receiving port deserializes each message after the timed call returns; a run waits for it.
const channel = new MessageChannel();
let delivered = () => {};
channel.port2.on('message', () => delivered());
const post = (value) => {
  channel.port1.postMessage(value);
  return new Promise((resolve) => (delivered = resolve));
};
/** Times one hand-off after a collection, so neither side pays the other's garbage. */
async function time(run) {
  gc();
  const start = now();
  const value = run();
  const ms = now() - start;
  if (!value) throw new Error('empty hand-off');
  await value;
  return ms;
}
const handoffs = {
  current: () => structuredClone(world),
  text: () => structuredClone(JSON.stringify(world)),
  currentSerialize: () => v8.serialize(world),
  textSerialize: () => v8.serialize(JSON.stringify(world)),
  currentPost: () => post(world),
  textPost: () => post(JSON.stringify(world)),
};

/** Largest k with P(Binomial(n, 1/2) < k) * 2 <= alpha: [r_k, r_(n-k+1)] covers the median. */
function medianInterval(values, alpha = 0.05) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const pmf = (i) => {
    let c = 1;
    for (let j = 0; j < i; j++) c = (c * (n - j)) / (j + 1);
    return c / 2 ** n;
  };
  let k = 0,
    below = 0;
  while (k + 1 <= n / 2 && 2 * (below + pmf(k)) <= alpha) below += pmf(k++);
  if (k === 0) throw new Error(`too few pairs (${n}) for a ${(1 - alpha) * 100}% interval`);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { median, low: sorted[k - 1], high: sorted[n - k], coverage: 1 - 2 * below };
}

async function measure(a, b) {
  const rows = [];
  // One untimed warm-up of each, so the first pair does not pay compilation.
  await handoffs[a]();
  await handoffs[b]();
  for (let i = 0; i < PAIRS; i++) {
    const first = i % 2 ? b : a;
    const second = first === a ? b : a;
    const ms = {};
    ms[first] = await time(handoffs[first]);
    ms[second] = await time(handoffs[second]);
    rows.push({ pair: i + 1, first, [a]: round(ms[a]), [b]: round(ms[b]), ratio: ms[b] / ms[a] });
    console.log(JSON.stringify({ ...rows.at(-1), ratio: round(rows.at(-1).ratio, 3) }));
  }
  const ratio = medianInterval(rows.map((row) => row.ratio));
  const med = (key) => medianInterval(rows.map((row) => row[key])).median;
  return {
    pairs: rows.length,
    medianMs: { [a]: round(med(a)), [b]: round(med(b)) },
    ratio: {
      median: round(ratio.median, 3),
      low: round(ratio.low, 3),
      high: round(ratio.high, 3),
      coverage: round(ratio.coverage, 4),
    },
    rows: rows.map((row) => ({ ...row, ratio: round(row.ratio, 3) })),
  };
}

const json = JSON.stringify(world);
const result = {
  task: 'T939',
  measured: new Date().toISOString(),
  node: process.version,
  world: {
    file: path.basename(file),
    year: world.year,
    clubs: world.clubs.length,
    players: world.players.length,
    people: Object.keys(world.people ?? {}).length,
    jsonChars: json.length,
    // The codec parses what the engine stringified; a lossy round trip would change the save.
    roundTripEqual: JSON.stringify(JSON.parse(json)) === json,
  },
  gc: Boolean(globalThis.gc),
  handoff: await measure('current', 'text'),
  senderSerialize: await measure('currentSerialize', 'textSerialize'),
  senderPostMessage: await measure('currentPost', 'textPost'),
};
channel.port1.close();
result.gate = result.handoff.ratio.high < 1;
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
for (const key of ['handoff', 'senderSerialize', 'senderPostMessage'])
  console.log(JSON.stringify({ [key]: result[key].ratio, medianMs: result[key].medianMs }));
console.log(JSON.stringify({ out, gate: result.gate }));
