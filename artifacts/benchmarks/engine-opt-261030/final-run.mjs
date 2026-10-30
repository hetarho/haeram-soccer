/** Final sequential evidence pass. Avoid running any other benchmark on this host concurrently. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync, watch } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, '../../..');
// The first progression pass was already running when the final runner was prepared.
// A filesystem event, rather than overlapping timing runs, starts this pass after it closes.
if (
  process.argv.includes('--after-progression') &&
  !existsSync(join(here, 'progression-summary.json'))
) {
  console.log('Waiting for the first progression pass to close.');
  await new Promise((resolve) => {
    const watcher = watch(here, () => {
      if (existsSync(join(here, 'progression-summary.json'))) {
        watcher.close();
        resolve();
      }
    });
  });
}
// Preserve earlier screens: their CPU field summed handlers rather than all process threads.
for (const name of readdirSync(here))
  if (name.startsWith('workers-') && name.endsWith('.json')) {
    const archived = 'preliminary-' + name;
    if (!existsSync(join(here, archived))) renameSync(join(here, name), join(here, archived));
  }
const receipts = [];
function run(label, script, args = []) {
  const before = new Date().toISOString();
  console.log(`Starting ${label}`);
  const r = spawnSync(process.execPath, [join(here, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    timeout: 1200000,
  });
  writeFileSync(join(here, `${label}.stdout.txt`), r.stdout ?? '');
  writeFileSync(join(here, `${label}.stderr.txt`), r.stderr ?? '');
  receipts.push({
    label,
    script,
    args,
    from: before,
    to: new Date().toISOString(),
    status: r.status,
    error: r.error?.message,
  });
  writeFileSync(join(here, 'run-receipts.json'), JSON.stringify(receipts, null, 2));
  console.log(
    JSON.stringify({
      label,
      status: r.status,
      tail: (r.stdout ?? '').trim().split('\n').slice(-2),
    }),
  );
  return r.status === 0;
}
run('final-workers', 'workers.mjs');
run('final-workers-slim', 'workers.mjs', ['slim']);
run('simd-kernel', 'simd.mjs');
run('grid-simd-screen', 'variants.mjs', ['screen', 'grid-simd-hypot', 'grid']);
const grid = JSON.parse(readFileSync(join(here, 'screen-grid-simd-hypot-grid.json'), 'utf8'));
if (grid.sameHash && grid.grid.cpu.call === 'faster')
  run('grid-simd-confirm', 'variants.mjs', ['confirm', 'grid-simd-hypot', 'grid']);
run('correctness', 'verify.mjs');
run('versus-current-helpers', 'progression.mjs', ['current']);
if (receipts.some((r) => r.status !== 0)) process.exitCode = 1;
