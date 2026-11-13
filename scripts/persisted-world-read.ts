/** Ownerless persisted-world calibration. JSON contains machine facts, not display copy. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform, release, totalmem } from 'node:os';
import { COUNTRIES, currency } from '../packages/catalogs/src/index';
import type { Club, Player } from '../packages/contracts/src/types';
import { historyWorld, liveHistory, HISTORY_START } from '../packages/engine/src/history';
import { FREE_AGENT_FLOW, originClub } from '../packages/engine/src/free-agents';
import { CLUB_LEVELS } from '../packages/engine/src/persisted-squads';
import { NPC_YOUTH } from '../packages/engine/src/npc-careers';
import { NPC_MARKET } from '../packages/engine/src/npc-market';
import {
  NPC_SQUAD,
  SQUAD_SPREAD,
  clubStyle,
  generateClubs,
  squad,
} from '../packages/engine/src/world';
import { formationOf, overall, slotOvr } from '../packages/engine/src/player-state';
import {
  currencyChange,
  npcBackingAllowance,
  npcWageBill,
  npcWageLimit,
} from '../packages/engine/src/books';
import { CLUB_BOOKS, NPC_BACKING } from '../packages/engine/src/owner-config';
import { scaleBy } from '../packages/engine/src/primitives';
import { marketValueAt } from '../packages/engine/src/market-prices';
import { transferWindowDays } from '../packages/engine/src/transfer-window';
import { advanceDays } from '../packages/engine/src/season';
import { currentDay, SEASON_END_DAY } from '../packages/engine/src/calendar';
import { measurementIdentity } from './lib/measurement-identity';
import { ANCHOR_YEARS, standingRecord } from './lib/transfer-reference';
import { distribution, fundingFacts, peakFacts } from './lib/persisted-world-facts';

const args = process.argv.slice(2);
const option = (key: string, fallback: string) => {
  const index = args.indexOf(`--${key}`);
  return index < 0 ? fallback : (args[index + 1] ?? fallback);
};
const seed = option('seed', 'persisted-world-viability');
const out = option('out', '');
const until = Number(option('until', '1980'));
const extend = Number(option('extend', String(until)));
// Only the named calibration knobs may be overridden. The founding draw stays in production mode.
const configFile = option('config', '');
if (configFile) {
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  for (const [key, target] of Object.entries({ NPC_SQUAD, NPC_YOUTH, CLUB_LEVELS, NPC_MARKET }))
    if (config[key]) Object.assign(target, config[key]);
}
const startedAt = new Date().toISOString();
const started = performance.now();
const computation = measurementIdentity('scripts/persisted-world-read.ts');
const w = historyWorld(seed);
const clubs = () => w.clubs.filter((c) => !c.representative);
const founding = new Map(
  generateClubs(seed)
    .filter((c) => !c.representative)
    .map((c) => [c.id, { tier: c.tier, strength: c.strength }]),
);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const flows = new Map<string, { release: number; sign: number; retire: number }>();
FREE_AGENT_FLOW.observe = (kind, p, club) => {
  const code = w.clubs.find((c) => c.id === club)?.country ?? originClub(w, p.id)?.country;
  const key = `${Math.floor(w.year / 10) * 10}:${code ?? 'unknown'}`;
  const row = flows.get(key) ?? { release: 0, sign: 0, retire: 0 };
  row[kind]++;
  flows.set(key, row);
};
const rows: object[] = [],
  books: object[] = [],
  summers: object[] = [],
  values: object[] = [];
const peaks = new Map<
  string,
  {
    firstAge: number;
    born: number;
    last: number;
    n: number;
    best: number;
    peakAge: number;
    tier: number;
    country: string;
    outfield: boolean;
  }
>();
const peakAges = () =>
  COUNTRIES.flatMap(({ code }) =>
    [
      ...new Set(
        clubs()
          .filter((c) => c.country === code)
          .map((c) => c.tier),
      ),
    ].map((tier) => ({
      country: code,
      tier,
      ...peakFacts([...peaks.values()], code, tier, Math.min(until, extend)),
    })),
  );
const configs = () => ({
  NPC_SQUAD,
  NPC_YOUTH,
  CLUB_LEVELS: {
    investment: CLUB_LEVELS.investment,
    decay: CLUB_LEVELS.decay,
    coachingAbility: CLUB_LEVELS.coachingAbility,
  },
  NPC_MARKET,
  SQUAD_SPREAD,
  CLUB_BOOKS,
  NPC_BACKING: NPC_BACKING.map((row) => ({ ...row, share: String(row.share) })),
});
const playerFact = (p: Player, c: Club) => ({
  id: p.id,
  club: c.id,
  country: c.country,
  tier: c.tier,
  age: w.year - p.born,
  ovr: overall(p),
});
function sample() {
  for (const { code } of COUNTRIES) {
    const countryClubs = clubs().filter((c) => c.country === code);
    rows.push({
      country: code,
      year: w.year,
      divisions: [...new Set(countryClubs.map((c) => c.tier))]
        .sort((a, b) => a - b)
        .map((tier) => {
          const division = countryClubs.filter((c) => c.tier === tier);
          const original = [...founding].filter(
            ([id, f]) => f.tier === tier && id.startsWith(`${code}:`),
          );
          const level = mean(original.map(([, f]) => f.strength))!;
          const strength = mean(division.map((c) => c.strength))!;
          const spans = division.map((c) => {
            const slots = formationOf(clubStyle(c));
            const ratings = squad(w, c)
              .slice(0, 11)
              .map((p, i) => slotOvr(p, slots[i]!));
            return Math.max(...ratings) - Math.min(...ratings);
          });
          return {
            tier,
            mean: strength,
            founding: level,
            change: strength - level,
            squadSize: distribution(division.map((c) => w.squads![c.id]!.length)),
            xiSpan: distribution(spans),
            xiAge: distribution(
              division.flatMap((c) =>
                squad(w, c)
                  .slice(0, 11)
                  .map((p) => w.year - p.born),
              ),
            ),
            academy: distribution(division.map((c) => c.levels!.academy)),
          };
        }),
      freeAgents: (w.freeAgents ?? []).filter((p) => originClub(w, p.id)?.country === code).length,
      flowByDecade: [...flows]
        .filter(([key]) => key.endsWith(`:${code}`))
        .map(([key, counts]) => ({ decade: Number(key.split(':')[0]), ...counts })),
    });
  }
  const strongest = clubs().toSorted(
    (a, b) => b.strength - a.strength || a.id.localeCompare(b.id),
  )[0]!;
  const best = clubs()
    .flatMap((c) => w.squads![c.id]!.map((p) => playerFact(p, c)))
    .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id))
    .slice(0, 11);
  affiliations.push({
    year: w.year,
    strongest: strongest.id,
    strength: strongest.strength,
    xi: squad(w, strongest)
      .slice(0, 11)
      .map((p) => playerFact(p, strongest)),
    best,
    bestClubs: new Set(best.map((p) => p.club)).size,
    bestAtStrongest: best.filter((p) => p.club === strongest.id).length,
  });
}
const affiliations: object[] = [];
const anchors = new Set(ANCHOR_YEARS.map(([year]) => year));
const averageFees = Object.fromEntries(ANCHOR_YEARS);
function annual() {
  const observe = (p: Player, c?: Club) => {
    const age = w.year - p.born,
      ovr = overall(p),
      prior = peaks.get(p.id);
    if (!prior && c)
      peaks.set(p.id, {
        firstAge: age,
        born: p.born,
        last: w.year,
        n: 1,
        best: ovr,
        peakAge: age,
        tier: c.tier,
        country: c.country,
        outfield: p.position !== 'GK',
      });
    else if (prior) {
      prior.last = w.year;
      prior.n++;
      if (ovr > prior.best) {
        prior.best = ovr;
        prior.peakAge = age;
        if (c) {
          prior.tier = c.tier;
          prior.country = c.country;
        }
      }
    }
  };
  for (const c of clubs()) for (const p of w.squads![c.id]!) observe(p, c);
  for (const p of w.freeAgents ?? []) observe(p);

  if (anchors.has(w.year)) {
    const prices = clubs()
      .filter((c) => c.country === 'ENG' && c.tier === 0)
      .flatMap((c) =>
        w.squads![c.id]!.map(
          (p) => Number(marketValueAt('ENG', w.year, 0, p)) / currency('ENG', w.year).units,
        ),
      );
    const record = standingRecord(w.year);
    const max = Math.max(...prices),
      average = mean(prices)!;
    values.push({
      year: w.year,
      n: prices.length,
      max,
      mean: average,
      record,
      maxRatio: max / record,
      averageFee: averageFees[w.year],
      meanRatio: averageFees[w.year] ? average / averageFees[w.year]! : undefined,
      extendedOwnerless: w.year > until,
    });
  }
}
function summer() {
  for (const { code } of COUNTRIES) {
    const selected = clubs().filter((c) => c.country === code);
    const envelopes = selected.map((c) => {
      const bill = npcWageBill(w, c),
        limit = npcWageLimit(w, c);
      return {
        club: c.id,
        tier: c.tier,
        bill: String(bill),
        limit: limit === undefined ? null : String(limit),
        unsupportedCommitments:
          limit === undefined ? null : String(bill > limit ? bill - limit : 0n),
      };
    });
    const breaches = selected.flatMap((c) => {
      const bill = npcWageBill(w, c),
        limit = npcWageLimit(w, c);
      return limit !== undefined && bill > limit
        ? [
            {
              club: c.id,
              tier: c.tier,
              bill: String(bill),
              limit: String(limit),
              unsupportedCommitments: String(bill - limit),
              ratio: Number(bill) / Number(limit),
            },
          ]
        : [];
    });
    summers.push({
      year: w.year,
      country: code,
      clubSeasons: selected.length,
      breaches: breaches.length,
      details: breaches,
      envelopes,
    });
  }
}
function closed(
  before: Map<
    string,
    { tier: number; strength: number; cash: string; debt: string; allowance: string }
  >,
) {
  for (const { code } of COUNTRIES) {
    const selected = clubs().filter((c) => c.country === code);
    const read = (c: Club) => {
      const opening = before.get(c.id)!;
      const book = c.books!.seasons[0]!;
      const funding = fundingFacts(book, opening);
      assert(funding.status === 'known', c.id);
      const raw = BigInt(funding.balanceBeforeBounds);
      const ceiling = BigInt(scaleBy(book.income, CLUB_BOOKS.cashSeasons, 1000n));
      const floor = -BigInt(scaleBy(book.income, CLUB_BOOKS.debtSeasons, 1000n));
      const bounded = raw > ceiling ? ceiling : raw < floor ? floor : raw;
      const carried =
        currencyChange(c.country, book.year, w.year)?.(String(bounded)) ?? String(bounded);
      return {
        club: c.id,
        ...opening,
        ...book,
        ratio: Number(book.wages) / Number(book.income),
        funding: {
          ...funding,
          investment: String(raw > ceiling ? raw - ceiling : 0n),
          debtWriteOff: String(raw < floor ? floor - raw : 0n),
          cash: c.books!.cash,
          debt: c.books!.debt,
          balanceReconciles: BigInt(c.books!.cash) - BigInt(c.books!.debt) === BigInt(carried),
        },
      };
    };
    const actual = selected.map(read);
    const strongest = selected
      .filter((c) => before.get(c.id)?.tier === 0)
      .sort((a, b) => before.get(b.id)!.strength - before.get(a.id)!.strength)
      .slice(0, 3)
      .map(read);
    books.push({
      year: selected[0]!.books!.seasons[0]!.year,
      country: code,
      clubSeasons: actual.length,
      maxRatio: Math.max(...actual.map((r) => r.ratio)),
      strongest,
      strongestMedian: distribution(strongest.map((r) => r.ratio)).median,
      breaches: actual.filter((r) => r.ratio > 1),
      wageAboveTurnoverDiagnostic: actual.filter((r) => r.ratio > 1).length,
      funding: actual,
      totals: actual.reduce(
        (a, r) => ({
          income: String(BigInt(a.income) + BigInt(r.income)),
          wages: String(BigInt(a.wages) + BigInt(r.wages)),
        }),
        { income: '0', wages: '0' },
      ),
    });
  }
}
function championFacts() {
  return COUNTRIES.map(({ code }) => {
    const seasons = w.history
      .filter((h) => h.year >= 1980 && h.year <= 2009)
      .map((h) => ({ year: h.year, club: h.champions.find((c) => c.country === code)?.club }));
    const titles = new Map<string, number>();
    for (const h of seasons) if (h.club) titles.set(h.club, (titles.get(h.club) ?? 0) + 1);
    return {
      country: code,
      seasons,
      different: titles.size,
      most: Math.max(0, ...titles.values()),
    };
  });
}

try {
  sample();
  while (w.year < extend) {
    annual();
    const year = w.year;
    const end = transferWindowDays(year).summerClose;
    if (end !== undefined) {
      advanceDays(w, end + 1 - currentDay(w), undefined, false);
      summer();
    }
    advanceDays(w, SEASON_END_DAY - currentDay(w), undefined, false);
    const before = new Map(
      clubs().map((c) => [
        c.id,
        {
          tier: c.tier,
          strength: c.strength,
          cash: c.books!.cash,
          debt: c.books!.debt,
          allowance: String(npcBackingAllowance(w, c)!),
        },
      ]),
    );
    liveHistory(w, year + 1);
    closed(before);
    if (w.year <= until) sample();
    if (w.year % 10 === 0) {
      if (out)
        writeFileSync(
          out + '.partial.json',
          JSON.stringify(
            {
              seed,
              from: HISTORY_START,
              until,
              extend,
              complete: false,
              configs: configs(),
              year: w.year,
              startedAt,
              computation,
              rows,
              books,
              summers,
              values,
              affiliations,
              peakAges: peakAges(),
              champions: championFacts(),
              playedSeasons: w.history.length,
            },
            null,
            2,
          ) + '\n',
        );
      console.error(
        JSON.stringify({ seed, year: w.year, elapsedMs: Math.round(performance.now() - started) }),
      );
    }
  }
  annual();
} finally {
  delete FREE_AGENT_FLOW.observe;
}

const output = JSON.stringify(
  {
    seed,
    from: HISTORY_START,
    until,
    extend,
    ownerless: true,
    playedSeasons: w.history.length,
    measured: true,
    complete: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() - started),
    source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    computation,
    machine: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      cpus: cpus().length,
      memoryBytes: totalmem(),
      node: process.version,
      load: loadavg(),
    },
    configs: configs(),
    rows,
    champions: championFacts(),
    affiliations,
    peakAges: peakAges(),
    values,
    books,
    summers,
  },
  null,
  2,
);
if (out) writeFileSync(out, output + '\n');
process.stdout.write(output + '\n');
