/** Close the research with the last packed-phase attempt, corrected parity and summary. */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, watch } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, '../../..');
const finished = () => {
  try {
    return JSON.parse(readFileSync(join(here, 'run-receipts.json'), 'utf8')).some(
      (r) => r.label === 'versus-current-helpers',
    );
  } catch {
    return false;
  }
};
if (!finished())
  await new Promise((resolve) => {
    const watcher = watch(here, () => {
      if (finished()) {
        watcher.close();
        resolve();
      }
    });
  });
const receipts = [];
function run(label, script, args = []) {
  console.log('Starting ' + label);
  const from = new Date().toISOString();
  const r = spawnSync(process.execPath, [join(here, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    timeout: 1200000,
  });
  writeFileSync(join(here, label + '.stdout.txt'), r.stdout ?? '');
  writeFileSync(join(here, label + '.stderr.txt'), r.stderr ?? '');
  receipts.push({
    label,
    script,
    args,
    from,
    to: new Date().toISOString(),
    status: r.status,
    error: r.error?.message,
  });
  writeFileSync(join(here, 'completion-receipts.json'), JSON.stringify(receipts, null, 2));
  console.log(
    JSON.stringify({
      label,
      status: r.status,
      tail: (r.stdout ?? '').trim().split('\n').slice(-1),
    }),
  );
  return r.status === 0;
}
if (!run('movement-parity', 'movement-parity.mjs')) process.exit(1);
if (!run('grid-phase-screen', 'variants.mjs', ['screen', 'grid-wasm-phase', 'grid']))
  process.exit(1);
const screen = JSON.parse(readFileSync(join(here, 'screen-grid-wasm-phase-grid.json'), 'utf8'));
if (screen.sameHash && screen.grid.cpu.call === 'faster') {
  run('grid-phase-confirm', 'variants.mjs', ['confirm', 'grid-wasm-phase', 'grid']);
  const confirmed = JSON.parse(
    readFileSync(join(here, 'confirm-grid-wasm-phase-grid.json'), 'utf8'),
  );
  if (confirmed.sameHash && confirmed.grid.cpu.call === 'faster')
    run('grid-phase-day', 'variants.mjs', ['confirm', 'grid-wasm-phase', 'day']);
}
if (!run('correctness-final', 'verify.mjs')) process.exit(1);
if (!run('summary', 'summarize.mjs')) process.exit(1);
if (receipts.some((r) => r.status !== 0)) process.exitCode = 1;
