// Times the save codec's fallback (pure-JS brotli q11/lgwin24) on a world's checkpoint bytes, and
// reports the gzip size that decides the fallback.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { pack } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/adapters/packing';
import { canonical } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/contracts/src/index';
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
(async () => {
  const w = v8.deserialize(readFileSync(process.argv[2]!));
  const bytes = new TextEncoder().encode(canonical(pack(w)));
  const gz = gzipSync(bytes);
  console.log('packed bytes', bytes.length, 'gzip bytes', gz.length, 'cjk14 chars ~', Math.ceil((gz.length * 8) / 14));
  if (process.argv[3] !== 'brotli') return;
  const { compress } = await import('/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/node_modules/.pnpm/brotli@2.1.0_patch_hash=563923945f4c166d8a41103c0406dc9a3e52f27c2fa3f9bc4b4c5b764ca35cf3/node_modules/brotli/compress.js');
  const a = cpu();
  const out = await compress(bytes, { quality: 11, lgwin: 24 });
  console.log('brotli q11 cpu ms', (cpu() - a).toFixed(0), 'bytes', out?.length, 'rss MB', (process.memoryUsage().rss / 1e6).toFixed(0));
})();
