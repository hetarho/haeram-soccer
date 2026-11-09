import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
if (outAt < 0 || !args[outAt + 1]) throw new Error('Every measurement must retain its --out JSON');
const output = resolve(args[outAt + 1]);
if (existsSync(output) || existsSync(`${output}.run.json`)) throw new Error('Refuse to overwrite/reuse a prior measurement');
const expected = JSON.parse(readFileSync('/tmp/ec10-v3-runtime-expectations.json', 'utf8'));
const arm = process.env.EC10_ARM ?? '';
const profile = expected.sources[arm];
if (!profile) throw new Error('Unknown measurement arm');
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
if (hash(readFileSync('/tmp/ec10-v3-runtime-expectations.json')) !== process.env.EC10_EXPECTATIONS_SHA || process.version !== expected.nodeVersion || hash(readFileSync('pnpm-lock.yaml')) !== expected.lockSha256) throw new Error('Frozen expectation/toolchain differs');
const prices = await import(pathToFileURL(resolve('packages/engine/src/market-prices.ts')).href);
const finance = await import(pathToFileURL(resolve('packages/engine/src/finance.ts')).href);
const endpoint = process.env.EC10_WAGE_ENDPOINT;
if (endpoint !== undefined) {
  const n = Number(endpoint);
  if (![2, 2.5, 2.75].includes(n)) throw new Error('Unapproved wage endpoint');
  const table = prices.MARKET_CONFIG.playerWageEra;
  if (!table || table.at(-1)?.[0] !== 2025) throw new Error('Source has no approved wage era table');
  table.at(-1)![1] = n;
}
if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== profile.head) throw new Error('Unexpected source HEAD');
if (JSON.stringify(prices.MARKET_CONFIG.playerWageEra ?? null) !== JSON.stringify(profile.playerWageEra) || JSON.stringify(finance.DISTRIBUTION_CONFIG.normalization ?? null) !== JSON.stringify(profile.normalization)) throw new Error('Unexpected runtime pricing config');
const dirty = [...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n'), ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n')].filter(Boolean);
if (dirty.some((p) => !profile.allowedDirty.includes(p))) throw new Error('Unapproved dirty source');
if (hash(readFileSync(expected.worldFile)) !== expected.worldSha256 || hash(readFileSync(expected.ownedFile)) !== expected.ownedSha256 || hash(readFileSync(expected.contractFile)) !== expected.contractSha256) throw new Error('Frozen input/contract changed');
const cpu = process.cpuUsage(), began = Date.now();
const provenance: Record<string, any> = {
  arm: process.env.EC10_ARM ?? 'unspecified', node: process.version, platform: process.platform, arch: process.arch, lockSha256: expected.lockSha256,
  cwd: process.cwd(), source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  trackedDiffSha256: hash(execFileSync('git', ['diff', 'HEAD'], { maxBuffer: 16 * 1024 * 1024 })),
  harnessSha256: hash(readFileSync('scripts/calibrate-cash-flow.ts')),
  observerSha256: hash(readFileSync('scripts/lib/settlement-payroll.ts')),
  launcherSha256: hash(readFileSync(new URL(import.meta.url))),
  effectivePlayerWageEra: prices.MARKET_CONFIG.playerWageEra ?? null,
  effectiveDistributionNormalization: finance.DISTRIBUTION_CONFIG.normalization ?? null,
  parameters: args, endpointOverride: endpoint ?? null,
  expectedProfile: profile, expectationsSha256: hash(readFileSync('/tmp/ec10-v3-runtime-expectations.json')),
  started: new Date(began).toISOString(), passed: false, passMeaning: 'execution/accounting only; economic acceptance evaluated separately',
};
try {
  if (provenance.harnessSha256 !== expected.harnessSha256 || provenance.observerSha256 !== expected.observerSha256) throw new Error('Frozen measurement files changed');
  await import(pathToFileURL(resolve('scripts/calibrate-cash-flow.ts')).href);
  const result = JSON.parse(readFileSync(output, 'utf8'));
  if (result.scriptSha256 !== provenance.harnessSha256 || result.payrollObserverSha256 !== provenance.observerSha256)
    throw new Error('Reported measurement code differs from the frozen runtime files');
  const expectedMode = args.includes('--owned-world-file') ? 'owned-continuation' : 'ownerless-takeover';
  const expectedInput = expectedMode === 'owned-continuation' ? expected.ownedSha256 : expected.worldSha256;
  if (result.source.revision !== profile.head || result.inputMode !== expectedMode || result.worldSha256 !== expectedInput || result.inputFileSha256 !== expectedInput) throw new Error('Run-reported source/input identity mismatch');
  const requestedSeasons = Number(args[args.indexOf('--seasons') + 1]);
  if (result.seasons.length !== requestedSeasons && result.ended == null) throw new Error('Unexplained incomplete scenario');
  for (const row of result.seasons) {
    if (BigInt(row.closingCash) - BigInt(row.openingBoundaryCash) !== BigInt(row.income) - BigInt(row.expense))
      throw new Error(`Cash identity mismatch in ${row.year}`);
  }
  provenance.passed = true;
  provenance.outputSha256 = hash(readFileSync(output));
  provenance.observedSeasons = result.seasons.length; provenance.ended = result.ended; provenance.requestedSeasons = requestedSeasons;
} catch (error) {
  provenance.error = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  provenance.finished = new Date().toISOString(); provenance.seconds = (Date.now() - began) / 1000;
  provenance.cpuMicroseconds = process.cpuUsage(cpu);
  writeFileSync(`${output}.run.json`, JSON.stringify(provenance, null, 2) + '\n');
}
