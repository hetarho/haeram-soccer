/**
 * Paired cash-flow observations on an identical ownerless world, no owner capital or building.
 * pnpm exec tsx scripts/calibrate-cash-flow.ts --year 1950 --country ENG --seed economy-0
 *   --world-file /tmp/world.json --world-source REV --club ENG:0:0:8 --seasons 5 --out run.json
 * A missing world file is generated with the production history/day loop and kept with a
 * .meta.json sidecar. Reuse both across revisions. --prepare writes it without taking over.
 * Monetary strings are nominal minor units, never inflation-adjusted. Paid-wage round samples
 * follow owner-balance.ts; opening/closing annual wage bills are exact reads, not cash expenses.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CountryCode, World } from '../packages/contracts/src/types';
import { careerEnded, type WealthTier } from '../packages/contracts/src/owner';
import { country } from '../packages/catalogs/src/index';
import { generateHistory, HISTORY_START, liveHistory } from '../packages/engine/src/history';
import { takeOver } from '../packages/engine/src/takeover';
import { advanceRound, closeSeason } from '../packages/engine/src/season';
import { clubOf } from '../packages/engine/src/player-state';
import { operatingCosts, seasonTurnover, wageBill } from '../packages/engine/src/finance';
import { defaultSettings, RESPONSIBILITY_KEYS } from '../packages/engine/src/responsibilities';
import { OWNER_LIVING } from '../packages/engine/src/owner-config';
import { SEASON_ROUNDS } from '../packages/engine/src/calendar';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const year = Number(option('year', '1950'));
const seasons = Number(option('seasons', '5'));
if (!Number.isInteger(year) || year < HISTORY_START || !Number.isInteger(seasons) || seasons < 0)
  throw new Error('Invalid year or season count');
const code = option('country', 'ENG') as CountryCode;
country(code);
const seed = option('seed', 'economy-0');
const tier = option('tier', 'oil') as WealthTier;
const file = option('world-file', '');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const diff = execFileSync('git', ['diff', 'HEAD'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
const source = {
  revision: sourceRevision,
  trackedDiffSha256: createHash('sha256').update(diff).digest('hex'),
};
const scriptSha256 = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex');
let world: World;
let generatedBy: unknown;
if (file && existsSync(file)) {
  const raw = readFileSync(file, 'utf8');
  world = JSON.parse(raw) as World;
  generatedBy = existsSync(`${file}.meta.json`)
    ? JSON.parse(readFileSync(`${file}.meta.json`, 'utf8'))
    : { revision: option('world-source', 'unknown'), seed, year };
} else {
  world = liveHistory(generateHistory(seed, HISTORY_START), year);
  generatedBy = { ...source, seed, year, scriptSha256 };
  if (file) {
    writeFileSync(file, JSON.stringify(world));
    writeFileSync(`${file}.meta.json`, JSON.stringify(generatedBy, null, 2));
  }
}
if (world.seed !== seed || world.year !== year || world.playerClub || world.owner)
  throw new Error('World file must be the specified seed/year before any takeover');
const worldSha256 = createHash('sha256').update(JSON.stringify(world)).digest('hex');
const identity = {
  source,
  scriptSha256,
  generatedBy,
  worldSha256,
  worldFile: file ? resolve(file) : null,
  seed,
  year,
  country: code,
  tier,
};
if (args.includes('--prepare')) {
  process.stdout.write(`${JSON.stringify(identity, null, 2)}\n`);
  process.exit(0);
}
const club = option('club', `${code}:0:0:8`);
if (world.clubs.find((candidate) => candidate.id === club)?.country !== code)
  throw new Error('Club must exist in the requested country');
takeOver(world, club, { tier, traits: [] });
world.settings = defaultSettings();
for (const key of RESPONSIBILITY_KEYS) world.settings.responsibilities[key] = 'delegated';
world.owner!.stake = 0;
world.owner!.dividendShare = 0;
if (args.includes('--purse-apart')) (OWNER_LIVING as { rate: number }).rate = 0;
const rows = [];
const sum = (values: readonly string[]) =>
  values.reduce((total, value) => total + BigInt(value), 0n);
for (let index = 0; index < seasons && !careerEnded(world); index++) {
  const currentYear = world.year;
  const openingCash = world.cash;
  // New-summer business can already have happened in takeOver/closeSeason. Subtract its
  // ledger net from live cash to give this year's actual opening boundary.
  const openingLedgerIncome = world.income;
  const openingLedgerExpense = world.expense;
  const openingBoundaryCash = (
    BigInt(openingCash) -
    BigInt(openingLedgerIncome) +
    BigInt(openingLedgerExpense)
  ).toString();
  const openingCurrency = world.currency;
  const openingWageBill = wageBill(world);
  const division = clubOf(world).tier;
  let paidWagesRoundSamples = 0n;
  while (world.round < SEASON_ROUNDS && !careerEnded(world)) {
    const payments = operatingCosts(world, world.round + 1).payments;
    paidWagesRoundSamples += sum([
      payments.playerWages,
      payments.managerWage,
      payments.staffWages ?? '0',
    ]);
    advanceRound(world, undefined, false);
  }
  const closingAnnualWageBill = wageBill(world);
  const turnover = seasonTurnover(world).toString();
  const completedFreeBids = (world.bids ?? [])
    .filter(
      (bid) =>
        bid.year === currentYear && bid.staff && bid.status === 'completed' && bid.fee === '0',
    )
    .map((bid) => bid.playerId);
  const beforeClose = {
    cash: world.cash,
    income: world.income,
    expense: world.expense,
    currency: world.currency,
  };
  // Real season close includes merit, sales, contract settlements and the next summer opening.
  // Archived cash belongs to this year; live cash after close belongs to the new year.
  if (!careerEnded(world)) closeSeason(world);
  const archive = world.history.findLast((entry) => entry.year === currentYear);
  const closed = archive && archive.year === currentYear ? archive : beforeClose;
  const events = world.events.filter(
    (event) => event.year === currentYear && event.currency === closed.currency,
  );
  const sales = sum(
    events
      .filter((event) => ['transfer-out', 'free-transfer-compensation'].includes(event.kind))
      .map((event) => event.amount ?? '0'),
  );
  const purchases = sum(
    events.filter((event) => event.kind === 'transfer-in').map((event) => event.amount ?? '0'),
  );
  const arrivals =
    world.transfers?.facts.filter(
      (fact) => fact.year === currentYear && fact.direction === 'in' && !fact.loan,
    ) ?? [];
  const paidFees = arrivals
    .map((fact) => BigInt(fact.fee))
    .filter((fee) => fee > 0n)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const freeIds = new Set([
    ...completedFreeBids,
    ...arrivals.filter((fact) => fact.fee === '0').map((fact) => fact.player),
    ...(world.bids ?? [])
      .filter(
        (bid) =>
          bid.year === currentYear && bid.staff && bid.status === 'completed' && bid.fee === '0',
      )
      .map((bid) => bid.playerId),
  ]);
  const saleTurnover = sum(
    events
      .filter((event) =>
        ['transfer-out', 'free-transfer-compensation', 'owner-injection'].includes(event.kind),
      )
      .map((event) => event.amount ?? '0'),
  );
  rows.push({
    year: currentYear,
    division,
    rank: archive?.rank ?? null,
    openingCurrency,
    currency: closed.currency,
    openingCash,
    openingLedgerIncome,
    openingLedgerExpense,
    openingBoundaryCash,
    closingCash: closed.cash,
    income: closed.income,
    expense: closed.expense,
    turnover: archive ? (BigInt(closed.income) - saleTurnover).toString() : turnover,
    purchases: purchases.toString(),
    sales: sales.toString(),
    openingAnnualWageBill: openingWageBill,
    closingAnnualWageBill,
    paidWagesRoundSamples: paidWagesRoundSamples.toString(),
    paidArrivals: paidFees.length,
    freeTopUpArrivals: events.filter((event) => event.kind === 'free-agent-signing').length,
    freeArrivals:
      freeIds.size + events.filter((event) => event.kind === 'free-agent-signing').length,
    paidMeanFee: paidFees.length
      ? (paidFees.reduce((a, b) => a + b, 0n) / BigInt(paidFees.length)).toString()
      : null,
    paidMedianFee: paidFees.length
      ? (
          (paidFees[Math.floor((paidFees.length - 1) / 2)] +
            paidFees[Math.floor(paidFees.length / 2)]) /
          2n
        ).toString()
      : null,
    ledgerEvents: events.filter(
      (event) => event.amount !== undefined || event.kind === 'free-agent-signing',
    ),
    arrivalFacts: arrivals,
    completedFreeBidPlayers: completedFreeBids,
  });
  process.stderr.write(
    `${currentYear}: ${club}, cash ${closed.cash}, paid ${paidFees.length}, free ${freeIds.size}\n`,
  );
}
const output = `${JSON.stringify({ ...identity, club, scenarios: year < 1980 ? 'historical' : 'modern', purseApart: args.includes('--purse-apart'), ownerMoneyMoved: false, construction: false, seasons: rows, ended: world.ended ?? world.bankrupt ?? null }, null, 2)}\n`;
const out = option('out', '');
if (out) writeFileSync(out, output);
else process.stdout.write(output);
