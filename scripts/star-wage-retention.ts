/** Controlled contract-policy stress matrix, complementary to the unmodified owner-career forecasts. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { decode } from '../apps/web/src/adapters/persistence';
import { ATTRIBUTES } from '../packages/contracts/src/player';
import type { BallonDorPlace } from '../packages/contracts/src/types';
import { BALLON_DOR_CONFIG } from '../packages/engine/src/ballon-dor';
import { MARKET_CONFIG, marketWage } from '../packages/engine/src/market-prices';
import { staffTalkVerdict, talkTerms } from '../packages/engine/src/contracts';
import { recentRevenue, wageBill } from '../packages/engine/src/finance';
import { clubOf } from '../packages/engine/src/player-state';
import { measurementIdentity } from './lib/measurement-identity';

const source = process.argv[2] ?? '/tmp/haeram-2036.haeram-save.json';
const raw = readFileSync(source, 'utf8');
const { world: w } = await decode(raw);
const identity = measurementIdentity('scripts/star-wage-retention.ts');
const current = structuredClone({ star: MARKET_CONFIG.star, premium: BALLON_DOR_CONFIG.premium });
const configure = (candidate: boolean) => {
  Object.assign(
    MARKET_CONFIG.star,
    candidate
      ? current.star
      : { from: 100, full: 101, maximum: 1, globalFrom: 100, globalFull: 101 },
  );
  Object.assign(
    BALLON_DOR_CONFIG.premium,
    candidate ? current.premium : { winner: 1.2, podium: 1.1, repeatWinner: 0 },
  );
};
const p = w.players.find((p) => p.status === 'active' && !p.loanUntil)!;
w.round = 23;
w.events = [];
w.morale = 80;
const club = clubOf(w);
const previous = structuredClone(w.history.at(-1)!);
previous.year = w.year - 1;
previous.currency = w.currency;
delete previous.ballonDor;
interface RetentionRow {
  ability: number;
  age: number;
  division: number;
  agent: 1 | 5;
  wins: number;
  revenueToOldBill: number;
  variant: 'baseline' | 'candidate';
  oldWage: string;
  demand: string;
  floor: string;
  oldBill: string;
  revenue: string;
  accept: boolean;
  reason?: string;
}
const results: RetentionRow[] = [];
for (const ability of [80, 90, 95])
  for (const age of [26, 33])
    for (const division of [0, 1])
      for (const agent of [1, 5] as const)
        for (const wins of [0, 1, 3]) {
          for (const key of ATTRIBUTES) p.attrs[key] = ability;
          Object.assign(p, {
            position: 'ST',
            positions: { ST: 3 },
            potential: ability,
            born: w.year - age,
            until: w.year + 1,
            agent,
          });
          club.tier = division;
          const podium: BallonDorPlace = {
            id: p.id,
            name: p.name,
            club: club.id,
            position: 'ST',
            goals: 30,
            assists: 5,
            appearances: 38,
            points: 100,
            honours: [],
          };
          w.history = [structuredClone(previous)];
          for (let i = 1; i <= wins; i++) {
            let season = w.history.find((h) => h.year === w.year - i);
            if (!season) {
              season = { ...structuredClone(previous), year: w.year - i };
              w.history.unshift(season);
            }
            season.ballonDor = [podium];
          }
          configure(false);
          p.wage = marketWage(w, p);
          const oldWage = p.wage;
          const bill = BigInt(wageBill(w));
          w.cash = (bill * 1000n).toString();
          for (const revenueToOldBill of [1.6, 2, 4, 8]) {
            const revenue = (bill * BigInt(revenueToOldBill * 10)) / 10n;
            w.income = (revenue / 2n).toString();
            w.history.at(-1)!.income = revenue.toString();
            for (const variant of ['baseline', 'candidate'] as const) {
              configure(variant === 'candidate');
              p.wage = oldWage;
              const terms = talkTerms(w, p);
              p.talk = {
                demand: terms.demand,
                floor: terms.floor,
                kind: 'renew',
                year: w.year,
                day: 0,
              };
              const verdict = staffTalkVerdict(w, p);
              results.push({
                ability,
                age,
                division,
                agent,
                wins,
                revenueToOldBill,
                variant,
                oldWage,
                demand: terms.demand,
                floor: terms.floor,
                oldBill: bill.toString(),
                revenue: recentRevenue(w),
                accept: verdict.accept,
                reason: verdict.accept ? undefined : verdict.reason,
              });
            }
          }
        }
configure(true);
const pairs = results
  .filter((r) => r.variant === 'baseline')
  .map((baseline, i) => ({ baseline, candidate: results[i * 2 + 1]! }));
const summary = {
  cases: results.length,
  retainedBefore: pairs.filter((p) => p.baseline.accept).length,
  retainedAfter: pairs.filter((p) => p.candidate.accept).length,
  newlyUnaffordable: pairs.filter((p) => p.baseline.accept && !p.candidate.accept).length,
  ordinaryChanged: pairs.filter(
    (p) =>
      p.baseline.ability === 80 &&
      p.baseline.wins === 0 &&
      p.baseline.accept !== p.candidate.accept,
  ).length,
  rejectedDespiteHighCash: results.filter(
    (r) => !r.accept && r.reason?.includes('최근 12개월 수입'),
  ).length,
};
if (summary.ordinaryChanged || !summary.newlyUnaffordable || !summary.rejectedDespiteHighCash)
  throw new Error(`Retention pressure invariant failed: ${JSON.stringify(summary)}`);
const out = 'artifacts/benchmarks/star-balance-261103/wage-retention.json';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      sourceSHA256: createHash('sha256').update(raw).digest('hex'),
      identity,
      current,
      note: 'Synthetic player and revenue scenarios on a decoded copy. Existing teammate wages retained; cash set high to isolate wage-share guardrails. These are contract-policy decisions, not simulated season outcomes.',
      summary,
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ out, summary }, null, 2));
