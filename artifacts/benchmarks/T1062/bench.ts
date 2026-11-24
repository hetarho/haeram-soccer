/**
 * validateWorld alone (T1062): a captured game database is read into its stored world once
 * (rowsToWorld, the same input for both sides), then the baseline tree's and the candidate tree's
 * validateWorld alternate on fresh clones of it; CPU and wall time per call, and the outputs'
 * canonical hash per side.
 *   node --import tsx bench.ts --db <file> --base <tree> --candidate <tree> [--reps 8] [--first base|candidate]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus, loadavg } from 'node:os';
import { sqlRecordStore } from '../../../apps/web/src/adapters/sqlRecordStore';
import { rowsToWorld } from '../../../apps/web/src/adapters/worldRows';
import { nodeSqliteDriver } from '../../../tests/fixtures/node-sqlite';
import { canonical } from '../../../packages/contracts/src/index';
import { LOAD_CATALOG } from '../../../packages/catalogs/src/index';

const args = process.argv.slice(2);
const flag = (n: string, f?: string) => (args.indexOf(n) < 0 ? f : args[args.indexOf(n) + 1]);
const load = async (tree: string) =>
  (await import(pathToFileURL(resolve(tree, 'packages/contracts/src/schema.ts')).href)).validateWorld;
const sides = {
  base: await load(flag('--base')!),
  candidate: await load(flag('--candidate')!),
} as Record<string, (i: unknown, c?: unknown, s?: unknown) => unknown>;
const store = sqlRecordStore(nodeSqliteDriver(':memory:', new Uint8Array(readFileSync(flag('--db')!))));
const assembly: number[] = [];
for (let i = 0; i < 3; i++) {
  const t = performance.now();
  rowsToWorld(store, { includeCold: false });
  assembly.push(performance.now() - t);
}
const input = rowsToWorld(store, { includeCold: false });
const reps = Number(flag('--reps', '8'));
const first = flag('--first', 'base')!;
const order = first === 'base' ? ['base', 'candidate'] : ['candidate', 'base'];
const out: Record<string, { cpu: number[]; wall: number[]; hash?: string }> = {
  base: { cpu: [], wall: [] },
  candidate: { cpu: [], wall: [] },
};
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex').slice(0, 16);
for (let r = -1; r < reps; r++)
  for (const side of r % 2 ? order : [...order].reverse()) {
    const clone = structuredClone(input);
    const c = process.cpuUsage();
    const t = performance.now();
    const result = sides[side](clone, LOAD_CATALOG, store);
    const wall = performance.now() - t;
    const u = process.cpuUsage(c);
    if (r < 0) {
      out[side].hash = hash(result);
      continue; // warm-up
    }
    out[side].wall.push(wall);
    out[side].cpu.push((u.user + u.system) / 1000);
  }
const report = { db: flag('--db'), first, reps, rowAssemblyMs: assembly, cpu: cpus()[0]?.model, loadavg: loadavg(), ...out };
if (flag('--out')) writeFileSync(flag('--out')!, JSON.stringify(report) + '\n');
const med = (x: number[]) => [...x].sort((a, b) => a - b)[x.length >> 1];
console.log(JSON.stringify({ base: [out.base.hash, med(out.base.cpu)], candidate: [out.candidate.hash, med(out.candidate.cpu)] }));
process.exit(0);
