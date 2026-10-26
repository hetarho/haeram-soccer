// node batch.mjs <tag> <tree> <jobs> <name>=<deep>,<shotScale>,<cutBack>[,<extra decide json>] ...
// Builds each patch (depth, T365's shot settings with the given scale, cut-back share, hold from
// HOLD or 1.6/0.35) and runs screen.mjs with them.
import { spawnSync } from 'node:child_process';

const [tag, tree, jobs, ...specs] = process.argv.slice(2);
const hold = process.env.HOLD ? JSON.parse(process.env.HOLD) : { far: 1.6, near: 0.35 };
const out = specs.map((spec) => {
  const [name, rest] = spec.split('=');
  const [deep, scale, cut, ...extra] = rest.split(',');
  const decide = {
    shotScale: +scale,
    longShotScale: 4,
    shotBox: 0.56,
    cutBackShare: +cut,
    ...(extra.length ? JSON.parse(extra.join(',')) : {}),
  };
  const patch = {
    shape: { deepLine: { candidate: { behindBall: +deep } } },
    coordination: { hold },
    decide: { candidate: decide },
  };
  return `${name}=${JSON.stringify(patch)}`;
});
const dir = new URL('.', import.meta.url).pathname;
const r = spawnSync('node', [`${dir}screen.mjs`, tag, tree, '600', jobs, ...out], { stdio: 'inherit' });
process.exit(r.status ?? 1);
