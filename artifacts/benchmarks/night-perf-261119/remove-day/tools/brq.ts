// D6b alternative (copied into the base tree as scripts/perf/brq.ts): pure-JS Brotli (the save codec's
// package) at lower qualities on a world's checkpoint bytes; gives up after 150 s.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { pack } from '../../apps/web/src/adapters/packing';
import { canonical } from '../../packages/contracts/src/index';
import { cpu } from './side';
setTimeout(() => { console.log(JSON.stringify({ gaveUp: true })); process.exit(0); }, 150000);
const w: any = v8.deserialize(readFileSync(process.argv[2]!));
const bytes = new TextEncoder().encode(canonical(pack(w)));
let a = cpu();
const gz = gzipSync(bytes);
console.log(JSON.stringify({ packedMB: +(bytes.length / 1e6).toFixed(2), gzipMB: +(gz.length / 1e6).toFixed(3), gzipMs: +(cpu() - a).toFixed(0) }));
const { compress } = await import('/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/node_modules/.pnpm/brotli@2.1.0_patch_hash=563923945f4c166d8a41103c0406dc9a3e52f27c2fa3f9bc4b4c5b764ca35cf3/node_modules/brotli/compress.js');
for (const [quality, lgwin] of (process.argv[3] ?? '5:22,7:22,9:22').split(',').map((x) => x.split(':').map(Number))) {
  a = cpu();
  const out = await compress(bytes, { quality, lgwin });
  console.log(JSON.stringify({ quality, lgwin, ms: +(cpu() - a).toFixed(0), MB: +((out?.length ?? 0) / 1e6).toFixed(3) }));
}
process.exit(0);
