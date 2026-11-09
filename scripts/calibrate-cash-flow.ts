/**
 * Paired cash-flow observations on an identical ownerless world, no owner capital or building.
 * pnpm exec tsx scripts/calibrate-cash-flow.ts --year 1950 --country ENG --seed economy-0
 *   --world-file /tmp/world.json --world-source REV --club ENG:0:0:8 --seasons 5 --out run.json
 * A missing world file is generated with the production history/day loop and kept with a
 * .meta.json sidecar. Reuse both across revisions. --prepare writes it without taking over.
 * --owned-world-file save.json continues an owned world without takeover/repricing. Its settings,
 * stake, dividend and existing works stay as saved; --delegate-all and --owner-money-zero opt into
 * the reference policy. --save-owned-world opening.json retains the actual paired opening world.
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
import { activePlayers, clubOf } from '../packages/engine/src/player-state';
import { operatingCosts, seasonTurnover, wageBill } from '../packages/engine/src/finance';
import { defaultSettings, RESPONSIBILITY_KEYS } from '../packages/engine/src/responsibilities';
import { OWNER_LIVING } from '../packages/engine/src/owner-config';
import { currentDay, SEASON_ROUNDS } from '../packages/engine/src/calendar';
import { countZeroFeeArrivals } from './lib/transfer-flow';
import { observeSettlementPayroll } from './lib/settlement-payroll';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const ownedFile = option('owned-world-file', '');
const ownedInput = ownedFile ? (JSON.parse(readFileSync(ownedFile, 'utf8')) as World) : undefined;
if (ownedInput && (!ownedInput.owner || !ownedInput.playerClub))
  throw new Error('Owned continuation requires an already-owned World JSON');
const year = Number(option('year', String(ownedInput?.year ?? 1950)));
const seasons = Number(option('seasons', '5'));
if (!Number.isInteger(year) || year < HISTORY_START || !Number.isInteger(seasons) || seasons < 0)
  throw new Error('Invalid year or season count');
const code = option('country', ownedInput ? clubOf(ownedInput).country : 'ENG') as CountryCode;
country(code);
const seed = option('seed', ownedInput?.seed ?? 'economy-0');
const tier = option('tier', ownedInput?.owner?.tier ?? 'oil') as WealthTier;
const file = ownedFile || option('world-file', '');
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
const payrollObserverSha256 = createHash('sha256')
  .update(readFileSync(new URL('./lib/settlement-payroll.ts', import.meta.url)))
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
if (world.seed !== seed || world.year !== year || (!ownedFile && (world.playerClub || world.owner)))
  throw new Error('World file must match the requested seed/year and ownership mode');
const worldSha256 = createHash('sha256').update(JSON.stringify(world)).digest('hex');
const identity = {
  source,
  scriptSha256,
  payrollObserverSha256,
  generatedBy,
  worldSha256,
  inputFileSha256:
    file && existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null,
  inputMode: ownedFile ? 'owned-continuation' : 'ownerless-takeover',
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
const club = option('club', ownedFile ? world.playerClub : `${code}:0:0:8`);
if (world.clubs.find((candidate) => candidate.id === club)?.country !== code)
  throw new Error('Club must exist in the requested country');
if (ownedFile && club !== world.playerClub)
  throw new Error('Owned continuation cannot change club');
if (ownedFile && tier !== world.owner!.tier)
  throw new Error('Owned continuation cannot change owner tier');
if (!ownedFile) takeOver(world, club, { tier, traits: [] });
const delegateAll = !ownedFile || args.includes('--delegate-all');
if (delegateAll) {
  world.settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS) world.settings.responsibilities[key] = 'delegated';
}
const zeroOwnerMoney = !ownedFile || args.includes('--owner-money-zero');
if (zeroOwnerMoney) {
  world.owner!.stake = 0;
  world.owner!.dividendShare = 0;
}
if (args.includes('--purse-apart')) (OWNER_LIVING as { rate: number }).rate = 0;
const initialContracts = activePlayers(world).map((p) => ({
  id: p.id,
  wage: p.wage,
  until: p.until,
  remainingSeasons: p.until - world.year,
  ...(p.clauses ? { clauses: p.clauses } : {}),
}));
const initialContractHorizon = {
  year: world.year,
  round: world.round,
  day: currentDay(world),
  players: initialContracts,
  manager: { wage: world.manager.wage, until: world.manager.until },
  coaches: (world.staff ?? []).map((p) => ({ id: p.id, wage: p.wage, until: p.until })),
};
const initialContractSha256 = createHash('sha256')
  .update(JSON.stringify(initialContractHorizon))
  .digest('hex');
const openingOwnedWorldSha256 = createHash('sha256').update(JSON.stringify(world)).digest('hex');
const policy = {
  settings: delegateAll ? 'all-delegated' : 'preserved',
  ownerMoney: zeroOwnerMoney ? 'stake-and-dividend-zero' : 'preserved',
  settingsAtStart: structuredClone(world.settings ?? null),
  stake: world.owner!.stake,
  dividendShare: world.owner!.dividendShare,
  automaticConstruction: false,
  existingFacilityWorks: structuredClone(world.facilityWorks ?? []),
};
const savedOwnedFile = option('save-owned-world', '');
if (savedOwnedFile) {
  writeFileSync(savedOwnedFile, JSON.stringify(world));
  writeFileSync(
    `${savedOwnedFile}.meta.json`,
    JSON.stringify(
      { ...identity, openingOwnedWorldSha256, initialContractSha256, policy },
      null,
      2,
    ),
  );
}
const rows = [];
const sum = (values: readonly string[]) =>
  values.reduce((total, value) => total + BigInt(value), 0n);
const payroll = observeSettlementPayroll(world);
try {
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
    const firstObservedRound = world.round + 1;
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
    const lastObservedRound = world.round;
    const turnover = seasonTurnover(world).toString();
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
    const settled = payroll.read(
      currentYear,
      closed.currency,
      firstObservedRound,
      lastObservedRound,
    );
    const yearEvents = world.events.filter((event) => event.year === currentYear);
    // Money is in the closed season's currency. Nonmonetary arrivals have no currency and
    // must survive independently; bid history is prunable and zero-fee transfer facts absent.
    const events = yearEvents.filter((event) => event.currency === closed.currency);
    const zeroFee = countZeroFeeArrivals(yearEvents, currentYear, closed.currency);
    const amountOf = (kind: string) =>
      sum(events.filter((event) => event.kind === kind).map((event) => event.amount ?? '0'));
    const operatingExpenses = amountOf('operating-expenses');
    if (firstObservedRound === 1 && operatingExpenses !== BigInt(settled.operatingExpenses))
      throw new Error(`Observed operating expenses disagree with the ${currentYear} ledger`);
    const leagueShare = amountOf('league-share'),
      leagueMerit = amountOf('league-merit'),
      parachute = amountOf('parachute');
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
      settledPlayerWages: settled.playerWages,
      settledManagerWages: settled.managerWages,
      settledCoachingWages: settled.coachingWages,
      settledWages: settled.payroll,
      settledOperatingExpenses: settled.operatingExpenses,
      operatingExpenses: operatingExpenses.toString(),
      domesticDistribution: (leagueShare + leagueMerit + parachute).toString(),
      distributionComponents: {
        leagueShare: leagueShare.toString(),
        leagueMerit: leagueMerit.toString(),
        parachute: parachute.toString(),
      },
      payrollCoverage: {
        firstRound: settled.firstRound,
        lastRound: settled.lastRound,
        count: settled.count,
        completeSeason: firstObservedRound === 1 && lastObservedRound === SEASON_ROUNDS,
      },
      payrollSettlements: settled.records,
      paidArrivals: paidFees.length,
      zeroFeeTransferMoves: zeroFee.zeroFeeMoves,
      freeTopUpArrivals: zeroFee.topUps,
      // Zero-fee ledger moves include zero-fee loans: the ledger does not encode free-agent origin.
      zeroFeeArrivals: zeroFee.total,
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
      ledgerEvents: yearEvents.filter(
        (event) => event.amount === undefined || event.currency === closed.currency,
      ),
      arrivalFacts: arrivals,
    });
    process.stderr.write(
      `${currentYear}: ${club}, cash ${closed.cash}, paid ${paidFees.length}, zero-fee ${zeroFee.total}\n`,
    );
  }
} finally {
  payroll.stop();
}
const output = `${JSON.stringify({ ...identity, initialContractHorizon, initialContractSha256, openingOwnedWorldSha256, policy, payrollAccounting: 'verified-operating-cost-boundary-v1', arrivalAccounting: 'ledger-zero-fee-including-loans-and-topups-v2', club, scenarios: year < 1980 ? 'historical' : 'modern', purseApart: args.includes('--purse-apart'), construction: false, seasons: rows, ended: world.ended ?? world.bankrupt ?? null }, null, 2)}\n`;
const out = option('out', '');
if (out) writeFileSync(out, output);
else process.stdout.write(output);
