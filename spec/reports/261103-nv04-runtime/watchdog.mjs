import { mkdir, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { vibeLoop } from '/Users/ihaelam/project/gusta/src/vibe-loop.mjs';
import { vibeCheckpoint } from '/Users/ihaelam/project/gusta/src/vibe.mjs';

const exec = promisify(execFile);
const workspace = '/Users/ihaelam/project/haeram-soccer/.tmp/nv04';
const control = '/Users/ihaelam/project/haeram-soccer/.tmp/nv04-control';
const options = { targetRoot: workspace, tag: 'nv04', provider: 'claude' };
const deadline = Date.parse('2026-11-04T09:30:00+09:00');
const waitUntil = (iso) => new Promise((resolve) => setTimeout(resolve, Math.max(1, Date.parse(iso) - Date.now())));
const log = (value) => process.stdout.write(JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n');
const awake = spawn('caffeinate', ['-i', '-m', '-s', '-t', String(Math.max(1, Math.ceil((deadline - Date.now()) / 1000)))], { detached: true, stdio: 'ignore' });
awake.unref();
await writeFile(`${control}/watchdog-status.json`, JSON.stringify({ pid: process.pid, status: 'armed', stop: '2026-11-04T09:15:00+09:00', snapshot: '2026-11-04T09:20:00+09:00', final: '2026-11-04T09:28:00+09:00', branch: 'wip/nv04' }, null, 2));
log({ status: 'armed' });
await waitUntil('2026-11-04T09:15:00+09:00');
await vibeLoop({ ...options, stop: true }).then((r) => log({ stopped: r.ok })).catch((e) => log({ stopError: e.message }));
for (const at of ['2026-11-04T09:20:00+09:00', '2026-11-04T09:28:00+09:00']) {
  await waitUntil(at);
  let success = false;
  for (let attempt = 0; attempt < 3 && Date.now() < deadline - 15000; attempt++) {
    try {
      await mkdir(`${workspace}/spec/reports/261103-nv04-runtime`, { recursive: true });
      await writeFile(`${workspace}/spec/reports/261103-nv04-runtime/deadline.json`, JSON.stringify({ at: new Date().toISOString(), deadline: '2026-11-04T09:30:00+09:00', reason: 'Owner-requested preservation of all continuation work; WIP is not a verified main release.' }, null, 2));
      const receipt = await vibeCheckpoint({ ...options, message: `${at.slice(11, 16)} KST deadline backup: all completed and unfinished work` });
      const { stdout } = await exec('git', ['ls-remote', 'origin', 'refs/heads/wip/nv04'], { cwd: workspace, timeout: 45000 });
      if (receipt.pushed === false || receipt.pushError || stdout.split(/\s/)[0] !== receipt.commit) throw new Error(receipt.pushError || 'Remote SHA mismatch');
      await writeFile(`${control}/watchdog-status.json`, JSON.stringify({ status: 'remote-confirmed', at: new Date().toISOString(), ...receipt }, null, 2));
      log({ remoteConfirmed: receipt.commit }); success = true; break;
    } catch (e) { log({ attempt, error: e.message }); await new Promise((r) => setTimeout(r, 10000)); }
  }
  if (!success) await writeFile(`${control}/watchdog-status.json`, JSON.stringify({ status: 'push-failed', at: new Date().toISOString() }));
}
