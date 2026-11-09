import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: invariance input.json output.json');
const load = (p: string) => import(pathToFileURL(resolve(p)).href);
const { advanceRound, closeSeason } = await load('packages/engine/src/season.ts');
const { SEASON_ROUNDS } = await load('packages/engine/src/calendar.ts');
const { careerEnded } = await load('packages/contracts/src/owner.ts');
const { OWNER_LIVING } = await load('packages/engine/src/owner-config.ts');
const { observeSettlementPayroll } = await load('scripts/lib/settlement-payroll.ts');
const hash = (x: unknown) => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const original = readFileSync(input, 'utf8');
if (existsSync(output)) throw new Error('Refuse to overwrite/reuse prior invariance output');
const expected = JSON.parse(readFileSync('/tmp/ec10-v3-runtime-expectations.json', 'utf8'));
if (hash(readFileSync('/tmp/ec10-v3-runtime-expectations.json', 'utf8')) !== process.env.EC10_EXPECTATIONS_SHA || process.version !== expected.nodeVersion || hash(readFileSync('pnpm-lock.yaml', 'utf8')) !== expected.lockSha256) throw new Error('Invariance expectation/toolchain changed');
const profile = expected.sources[process.env.EC10_ARM ?? ''];
if (!profile || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== profile.head || hash(original) !== expected.ownedSha256) throw new Error('Invariance source/input differs from frozen profile');
const dirty = [...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n'), ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n')].filter(Boolean);
if (dirty.some((p) => !profile.allowedDirty.includes(p))) throw new Error('Unapproved invariance dirty source');
const price = await load('packages/engine/src/market-prices.ts'), finance = await load('packages/engine/src/finance.ts');
if (JSON.stringify(price.MARKET_CONFIG.playerWageEra ?? null) !== JSON.stringify(profile.playerWageEra) || JSON.stringify(finance.DISTRIBUTION_CONFIG.normalization ?? null) !== JSON.stringify(profile.normalization)) throw new Error('Invariance config mismatch');
if (hash(readFileSync('scripts/lib/settlement-payroll.ts', 'utf8')) !== expected.observerSha256) throw new Error('Invariance observer changed');
const controls = [JSON.parse(original), JSON.parse(original)];
const previousLiving = OWNER_LIVING.season;
OWNER_LIVING.season = 0;
const report: Record<string, any> = {
  source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, platform: process.platform, arch: process.arch, expectationsSha256: process.env.EC10_EXPECTATIONS_SHA,
  input, inputSha256: hash(original), policy: 'unchanged owned input; purse apart in both controls',
  observerSha256: hash(readFileSync('scripts/lib/settlement-payroll.ts', 'utf8')),
  started: new Date().toISOString(), passed: false,
};
let observer: any;
try {
  for (let i = 0; i < controls.length; i++) {
    const world = controls[i], year = world.year, currency = world.currency, first = world.round + 1;
    if (i === 1) observer = observeSettlementPayroll(world);
    while (world.round < SEASON_ROUNDS && !careerEnded(world)) advanceRound(world, undefined, false);
    const beforeClose = hash(world);
    const settled = observer ? observer.read(year, currency, first, world.round) : null;
    if (world.round !== SEASON_ROUNDS || careerEnded(world)) throw new Error('Reference ended before a complete season');
    closeSeason(world);
    const afterClose = hash(world);
    report[i === 0 ? 'withoutObserver' : 'withObserver'] = { beforeClose, afterClose, settled };
    if (observer) { observer.stop(); observer = undefined; }
  }
  report.passed = report.withoutObserver.beforeClose === report.withObserver.beforeClose &&
    report.withoutObserver.afterClose === report.withObserver.afterClose && report.withObserver.settled.count === SEASON_ROUNDS;
  if (!report.passed) throw new Error('Actual progression differs with the measurement observer');
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  observer?.stop(); OWNER_LIVING.season = previousLiving;
  report.finished = new Date().toISOString();
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ source: report.source, passed: report.passed, output }));
