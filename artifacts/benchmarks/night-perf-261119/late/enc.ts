// Times the codec worker's checkpoint encode (adapters/persistence encode) on world snapshots.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import { encode } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/adapters/persistence';
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
(async () => { for (const f of process.argv.slice(2)) {
  const w = v8.deserialize(readFileSync(f));
  const a = cpu();
  const raw = await encode(w, 2, 1);
  console.log(f.split('/').pop(), 'encode cpu ms', (cpu() - a).toFixed(0), 'raw chars', raw.length);
} })();
