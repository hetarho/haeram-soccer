import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vibeLoop, executeVibeUnit } from '/Users/ihaelam/project/haeram-spec-creator/src/vibe-loop.mjs';
import { vibePreflight, vibeStatus, vibePush, vibeCheckpoint } from '/Users/ihaelam/project/haeram-spec-creator/src/vibe.mjs';
import { runVibeCheck } from '/Users/ihaelam/project/haeram-spec-creator/src/vibe-check.mjs';
import { vibeCIWait } from '/Users/ihaelam/project/haeram-spec-creator/src/vibe-ci.mjs';

const exec = promisify(execFile);
const control = path.dirname(fileURLToPath(import.meta.url));
const root = '/Users/ihaelam/project/haeram-soccer';
const workspace = path.join(root, '.tmp/nv04');
const tag = 'nv04';
const implementationEnd = Date.parse('2026-11-04T09:10:00+09:00');
const stopAt = Date.parse('2026-11-04T09:15:00+09:00');
const snapshotAt = Date.parse('2026-11-04T09:20:00+09:00');
const finalSnapshotAt = Date.parse('2026-11-04T09:28:00+09:00');
const hardDeadline = Date.parse('2026-11-04T09:30:00+09:00');
const adapter = path.join(control, 'adapter.json');
const runtime = path.join(root, '.git/haeram/v1/loops', tag);
const report = 'spec/reports/261103-nv04.md';
const attachment = path.join(workspace, 'spec/reports/261103-nv04-runtime');
const common = { targetRoot: workspace, tag, provider: 'claude', permissionMode: 'acceptEdits', adapter,
  allowTool: ['Bash(git *)', 'Bash(node *)', `Bash(${process.execPath} /Users/ihaelam/project/haeram-spec-creator/bin/haeram-spec-creator.mjs *)`, 'Bash(pnpm *)', 'Bash(npx haeram-spec-creator *)', 'Bash(rg *)', 'Bash(sed *)', 'Bash(cat *)', 'Bash(tail *)', 'Bash(head *)', 'Bash(wc *)', 'Bash(ls *)', 'Bash(mkdir *)', 'Bash(env *)', 'Bash(PREVIEW_BUILD=1 pnpm *)'],
  probe: 'git status --porcelain', probeTimeoutMs: 120000,
  verify: ['pnpm run verify:batch'], timeoutMs: 16200000,
  env: { ...process.env, BROWSER_TEST_PORT: '4634' } };
process.env.BROWSER_TEST_PORT = '4634';
const state = { tag, started: new Date().toISOString(), workspace, deadline: '2026-11-04T09:30:00+09:00', intermediatePublished: false, epochs: [], checkpoints: [], repairs: [], ci: [], status: 'starting' };
const save = () => writeFile(path.join(control, 'status.json'), JSON.stringify(state, null, 2) + '\n');
const log = (event) => { process.stdout.write(JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n'); };
const git = async (...args) => (await exec('git', args, { cwd: workspace, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
const codeFiles = (files) => files.split('\n').filter(Boolean).filter((f) => !/^(spec\/|docs\/|artifacts\/)|\.md$/i.test(f));
let snapshotRunning = null, repairCount = 0, repairNoProgress = 0, preflight, stopRequested = false;
const ciReceipts = new Map();

await mkdir(control, { recursive: true });
await writeFile(adapter, JSON.stringify({ command: process.execPath, args: [path.join(control, 'adapter.mjs')] }));
await save();
if (process.argv.includes('--plan')) {
  log({ plan: { workspace, implementationEnd: new Date(implementationEnd).toISOString(), stopAt: new Date(stopAt).toISOString(), snapshotAt: new Date(snapshotAt).toISOString(), finalSnapshotAt: new Date(finalSnapshotAt).toISOString(), hardDeadline: new Date(hardDeadline).toISOString(), permissions: common.permissionMode } });
  process.exit(0);
}
const awake = spawn('caffeinate', ['-i', '-m', '-s', '-t', String(Math.max(1, Math.ceil((hardDeadline - Date.now()) / 1000)))], { detached: true, stdio: 'ignore' });
awake.unref();

async function archiveStatus() {
  await mkdir(attachment, { recursive: true });
  await writeFile(path.join(attachment, 'status.json'), JSON.stringify(state, null, 2) + '\n');
  await Promise.all(['host.mjs', 'adapter.mjs'].map((f) => copyFile(path.join(control, f), path.join(attachment, f))));
}
async function checkpoint(message) {
  if (snapshotRunning) { await snapshotRunning; }
  snapshotRunning = (async () => {
    await archiveStatus();
    const receipt = await vibeCheckpoint({ ...common, message });
    if (receipt.pushed === false || receipt.pushError) throw new Error(receipt.pushError || 'Checkpoint was not pushed');
    // An unchanged snapshot is successful only when its exact commit exists remotely.
    const remote = await exec('git', ['ls-remote', 'origin', 'refs/heads/wip/nv04'], { cwd: workspace, timeout: 60000 });
    if (remote.stdout.split(/\s/)[0] !== receipt.commit) throw new Error('Remote checkpoint SHA did not match');
    state.checkpoints.push({ at: new Date().toISOString(), ...receipt, remoteConfirmed: true });
    await save(); log({ checkpoint: receipt.commit, message, remoteConfirmed: true });
    return receipt;
  })();
  try { return await snapshotRunning; } finally { snapshotRunning = null; }
}
async function requestStop() {
  stopRequested = true;
  await vibeLoop({ ...common, stop: true });
  log({ stop: 'deadline' });
}
const stopTimer = setTimeout(() => requestStop().catch((e) => log({ stopError: e.message })), Math.max(1, stopAt - Date.now()));
const snapshotTimer = setTimeout(() => checkpoint('09:20 KST deadline preservation: all continuation work').catch((e) => log({ snapshotError: e.message })), Math.max(1, snapshotAt - Date.now()));
const finalTimer = setTimeout(async () => {
  try { await requestStop(); await checkpoint('09:28 KST final remote preservation before 09:30 deadline'); }
  catch (e) { log({ finalSnapshotError: e.message }); }
}, Math.max(1, finalSnapshotAt - Date.now()));
const hourly = setInterval(() => checkpoint('hourly overnight preservation').catch((e) => log({ checkpointError: e.message })), 3600000);

async function repair(failure) {
  if (stopRequested || Date.now() >= implementationEnd || ++repairCount > 6 || repairNoProgress >= 2) return;
  await writeFile(path.join(control, 'repair.json'), JSON.stringify(failure, null, 2));
  const before = await git('rev-parse', 'HEAD');
  const status = await vibeStatus({ ...common, fetch: false });
  const job = { schemaVersion: 1, role: 'unit', mode: 'autopilot', workspaceMode: 'single', workspace, tag, report,
    status, brief: null, cliCommand: [process.execPath, '/Users/ihaelam/project/haeram-spec-creator/bin/haeram-spec-creator.mjs'],
    allowTools: common.allowTool, permissionMode: 'acceptEdits', diffBase: before, hostManaged: true, gateRepair: true,
    coordinatorDirective: 'Prioritize this concrete release/CI failure over the remaining feature queue. Read releaseFailure and its full log/JSON reports. Complete exactly one scoped lightweight fix if it meets start-vibe limits; otherwise create one concrete repair task with create-task and make it STATE next, then return planning. Preserve every acceptance assertion and all validation scopes. Do not run the release/integration/browser gate; the host reruns it after your changes. Commit related changes and preserve partial findings. Do not park because reversible technical decisions are needed.' };
  const receipt = await executeVibeUnit(common, job, runtime, { stopFile: path.join(runtime, 'STOP'), deadline: implementationEnd, timeoutMs: Math.min(3600000, implementationEnd - Date.now()) });
  const after = await git('rev-parse', 'HEAD');
  repairNoProgress = before === after ? repairNoProgress + 1 : 0;
  state.repairs.push({ ...receipt, before, after }); await save();
  log({ repair: receipt.result, exitCode: receipt.exitCode, changed: before !== after });
}
const releaseBase = await git('rev-parse', 'origin/main');
async function check(options, command) {
  const result = await runVibeCheck({ ...options, diffBase: releaseBase }, command);
  if (!result.ok) await repair({ type: 'release-gate', command, ...result, verificationReport: '.tmp/verification/latest.json' });
  return result;
}
async function waitCI(options) {
  if (!ciReceipts.has(options.commit)) ciReceipts.set(options.commit, vibeCIWait(options));
  const result = await ciReceipts.get(options.commit);
  if (!state.ci.some((x) => x.commit === options.commit)) { state.ci.push(result); await save(); }
  return result;
}
async function push(options) {
  const before = await git('rev-parse', 'origin/main');
  const hasCode = codeFiles(await git('diff', '--name-only', before, 'HEAD')).length > 0;
  let verified = await git('rev-parse', 'HEAD');
  // The recovered checkpoint already contains unreleased code. Always gate the whole
  // difference from main, even when a loop's local unit made metadata-only changes.
  if (hasCode) {
    const checked = await check({ targetRoot: workspace, tier: 'batch', heavy: true, timeoutMs: Math.min(7200000, Math.max(1, implementationEnd - Date.now())) }, 'pnpm run verify:batch');
    if (!checked.ok) throw new Error(`Release gate failed: ${checked.log}`);
    verified = await git('rev-parse', 'HEAD');
  }
  const result = await vibePush({ ...options, ...(hasCode ? { verifiedCommit: verified } : {}) });
  if (result.pushed && hasCode) {
    state.intermediatePublished = true; state.lastMainPush = result.pushed; await save();
    log({ mainPushed: result.pushed });
    const ci = await waitCI({ ...common, commit: result.pushed, branch: 'main', diffBase: before, timeoutMs: Math.max(1, Math.min(3600000, implementationEnd - Date.now())) });
    if (!ci.ok) { await repair({ type: 'CI', ...ci }); throw new Error(`CI failed: ${ci.runUrl ?? ci.outcome}`); }
  }
  return result;
}

try {
  preflight = await vibePreflight({ ...common, probeWorkspace: 'current' });
  await writeFile(path.join(control, 'preflight.json'), JSON.stringify(preflight, null, 2));
  if (!preflight.ok) throw new Error(`Preflight failed: ${JSON.stringify(preflight.checks.filter((x) => !x.ok))}`);
  await checkpoint('overnight continuation initialized; deadline 2026-11-04 09:30 KST');
  state.status = 'running'; await save();
  for (let epoch = 0; epoch < 20 && Date.now() < implementationEnd && !stopRequested; epoch++) {
    const before = await git('rev-parse', 'HEAD');
    const result = await vibeLoop({ ...common, maxUnits: state.intermediatePublished ? 100 : 1, maxHours: Math.max(0.001, (implementationEnd - Date.now()) / 3600000), batchSize: 3 }, { preflight: async () => preflight, check, push, ci: waitCI });
    state.epochs.push(result); await save(); log({ epoch, ok: result.ok, reason: result.reason, error: result.error, units: result.units });
    await checkpoint(`overnight epoch ${epoch + 1}: ${result.reason}`);
    if (['no-work', 'parked-only', 'stop-file', 'max-hours', 'design'].includes(result.reason)) break;
    if (['session-failures', 'no-progress'].includes(result.reason) || repairNoProgress >= 2) break;
    if (result.error && before === await git('rev-parse', 'HEAD')) break;
  }
  state.status = 'stopped';
} catch (error) {
  state.status = 'failed'; state.error = error.stack; log({ error: error.message });
} finally {
  state.finished = new Date().toISOString(); await save();
  try { await checkpoint('final overnight state, including unfinished work and actual verification limits'); }
  catch (error) { state.finalPushError = error.message; await save(); log({ checkpointError: error.message }); }
  // Fast-forward the user's untouched main checkout after remote publication.
  if (state.lastMainPush) {
    try {
      const [dirty, branch] = await Promise.all([exec('git', ['status', '--porcelain'], { cwd: root }), exec('git', ['branch', '--show-current'], { cwd: root })]);
      if (!dirty.stdout.trim() && branch.stdout.trim() === 'main') await exec('git', ['merge', '--ff-only', 'origin/main'], { cwd: root });
    } catch (error) { state.localMainSync = error.message; await save(); }
  }
  clearInterval(hourly);
  if (!state.finalPushError) { clearTimeout(stopTimer); clearTimeout(snapshotTimer); clearTimeout(finalTimer); }
  log({ finished: state.status, finalPushError: state.finalPushError ?? null, main: state.lastMainPush ?? null });
}
