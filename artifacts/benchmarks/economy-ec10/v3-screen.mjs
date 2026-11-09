import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const directory = '/tmp/ec10-v3-measurements';
mkdirSync(directory, { recursive: true });
const sources = {"baseline": "/tmp/haeram-ec10-v3-baseline", "wage-only": "/tmp/haeram-ec10-v3-wage-only", "distribution-only": "/tmp/haeram-ec10-v3-distribution-only", "joint": "/tmp/haeram-ec10-v3-joint"};
const frozen = { 'scripts/calibrate-cash-flow.ts': 'eaa77891e1ee5370274072b3948f219db0aeb2e97d9526c3a4a2b487e25b059a', 'scripts/lib/settlement-payroll.ts': 'a0d202893b4f9725787131cc7336abcd6c669b8ad9d8c420e28ae66b61d87247' };
const hash = (s) => createHash('sha256').update(s).digest('hex');
const expected = JSON.parse(readFileSync('/tmp/ec10-v3-runtime-expectations.json', 'utf8'));
if (existsSync(`${directory}/first-screen.json`)) throw new Error('Refuse to overwrite/reuse a prior screen');
if (hash(readFileSync(expected.worldFile)) !== expected.worldSha256 || hash(readFileSync(expected.ownedFile)) !== expected.ownedSha256 || hash(readFileSync(expected.contractFile)) !== expected.contractSha256) throw new Error('Frozen inputs changed');
for (const [arm, cwd] of Object.entries(sources)) {
  const profile = expected.sources[arm];
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim() !== profile.head) throw new Error('Wrong source tree');
  const dirty = [...execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd, encoding: 'utf8' }).trim().split('\n'), ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' }).trim().split('\n')].filter(Boolean);
  if (dirty.some((p) => !profile.allowedDirty.includes(p)) || hash(readFileSync(`${cwd}/pnpm-lock.yaml`)) !== expected.lockSha256) throw new Error('Unexpected dirty source/toolchain');
}
const expectationsSha256 = hash(readFileSync('/tmp/ec10-v3-runtime-expectations.json'));
for (const cwd of Object.values(sources)) for (const [file, digest] of Object.entries(frozen))
  if (hash(readFileSync(`${cwd}/${file}`)) !== digest) throw new Error(`Changed frozen file ${cwd}/${file}`);
const report = { started: new Date().toISOString(), scope: 'Frozen four-arm screen on common released44 owner/history rules', frozen, stages: [], passed: false, passMeaning: 'execution/accounting only, not economic acceptance', economicAccepted: null, expectationsSha256: hash(readFileSync('/tmp/ec10-v3-runtime-expectations.json')), contractSha256: expected.contractSha256 };
const save = () => writeFileSync(`${directory}/first-screen.json`, JSON.stringify(report, null, 2) + '\n');
async function run(id, cwd, argv, arm) {
  const fd = openSync(`${directory}/${id}.log`, 'w'), start = Date.now();
  const code = await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'tsx', ...argv], { cwd, env: { ...process.env, EC10_ARM: arm, EC10_EXPECTATIONS_SHA: expectationsSha256 }, stdio: ['ignore', fd, fd] });
    child.once('error', reject); child.once('close', resolve);
  });
  closeSync(fd);
  const entry = { id, cwd, command: ['pnpm', 'exec', 'tsx', ...argv], code, seconds: (Date.now() - start) / 1000 };
  report.stages.push(entry); save(); console.log(JSON.stringify(entry));
  if (code !== 0) throw new Error(`${id} failed; retain log and stop the screen`);
}
try {
  for (const [arm, cwd] of Object.entries(sources))
    await run(`invariance-${arm}`, cwd, ['/tmp/ec10-v3-invariance.mts', '/tmp/ec10-v3-inputs/owned-ENG-top.json', `${directory}/invariance-${arm}.json`], arm);
  const cases = [['ENG-top', 'ENG', 'ENG:0:0:8'], ['ESP-lower', 'ESP', 'ESP:1:0:0'], ['ENG-weak', 'ENG', 'ENG:3:0:6']];
  const jobs = Object.entries(sources).flatMap(([arm, cwd]) => cases.map(([name, country, club]) => ({ arm, cwd, name, country, club })));
  let next = 0, failure = null;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (!failure && next < jobs.length) {
      const job = jobs[next++], id = `fit-${job.arm}-${job.name}`;
      try {
        await run(id, job.cwd, ['/tmp/ec10-v3-run-cash.mts', '--year', '2025', '--country', job.country, '--seed', 'economy-ec09-0', '--world-file', '/tmp/ec09-worlds/economy-ec09-0-2025.json', '--world-source', '60c5d4ba', '--club', job.club, '--tier', 'oil', '--seasons', '10', '--purse-apart', '--out', `${directory}/${id}.json`], job.arm);
      } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
  report.passed = report.stages.length === 16 && report.stages.every((s) => s.code === 0);
} catch (error) {
  report.error = error.stack ?? String(error); process.exitCode = 1;
} finally { report.finished = new Date().toISOString(); save(); }
