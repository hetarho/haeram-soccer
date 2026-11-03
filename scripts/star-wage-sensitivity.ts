/** Deterministic wage sensitivity over actual pricing/premium functions, plus preserved ordinary targets. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { measurementIdentity } from './lib/measurement-identity';
import { MARKET_CONFIG, marketWageUnits } from '../packages/engine/src/market-prices';
import { BALLON_DOR_CONFIG, ballonDorPremium } from '../packages/engine/src/ballon-dor';
import { agentPremium } from '../packages/engine/src/contracts';
import { footballQuote } from '../packages/engine/src/quotes';
import type { AgentRating, BallonDorPlace } from '../packages/contracts/src/types';
const current = structuredClone({ star: MARKET_CONFIG.star, premium: BALLON_DOR_CONFIG.premium });
const identity = measurementIdentity('scripts/star-wage-sensitivity.ts');
const podium: BallonDorPlace = {
  id: 'star',
  name: 'Star',
  club: 'club',
  position: 'ST',
  goals: 20,
  assists: 5,
  appearances: 38,
  points: 100,
  honours: [],
};
const histories = {
  none: [],
  podium: [{ year: 2029, ballonDor: [{ ...podium, id: 'winner' }, podium] }],
  winner: [{ year: 2029, ballonDor: [podium] }],
  repeat2: [2028, 2029].map((year) => ({ year, ballonDor: [podium] })),
  repeat3: [2027, 2028, 2029].map((year) => ({ year, ballonDor: [podium] })),
};
let combinations = 0;
const results = [];
for (const variant of ['baseline', 'candidate']) {
  Object.assign(
    MARKET_CONFIG.star,
    variant === 'baseline'
      ? { from: 100, full: 101, maximum: 1, globalFrom: 100, globalFull: 101 }
      : current.star,
  );
  Object.assign(
    BALLON_DOR_CONFIG.premium,
    variant === 'baseline' ? { winner: 1.2, podium: 1.1, repeatWinner: 0 } : current.premium,
  );
  const demand = (
    ability: number,
    age: number,
    division: number,
    agent: AgentRating,
    honour: keyof typeof histories,
    promise = 0,
  ) =>
    marketWageUnits(division, ability, age, Math.min(99, ability + promise)) *
    agentPremium(agent) *
    ballonDorPremium(histories[honour], 2030, 'star').factor;
  let monotonic = true,
    finite = true;
  for (const age of [18, 22, 26, 30, 33, 38])
    for (const division of [0, 1, 2, 3])
      for (const agent of [1, 2, 3, 4, 5] as AgentRating[])
        for (const honour of Object.keys(histories) as (keyof typeof histories)[])
          for (const promise of [0, 10]) {
            let previous = 0;
            for (let ability = 40; ability <= 99; ability++) {
              const value = demand(ability, age, division, agent, honour, promise);
              combinations++;
              monotonic &&= value > previous;
              finite &&= Number.isFinite(value) && value > 0;
              previous = value;
            }
          }
  const regular = demand(80, 26, 0, 1, 'none');
  results.push({
    variant,
    monotonic,
    finite,
    ordinary80vs60: regular / demand(60, 26, 0, 1, 'none'),
    ordinarySecondTierShare: demand(70, 26, 1, 1, 'none') / demand(70, 26, 0, 1, 'none'),
    examples: [70, 80, 85, 90, 95, 99].map((ability) => ({
      ability,
      baseVsRegular80: demand(ability, 26, 0, 1, 'none') / regular,
      winnerVsRegular80: demand(ability, 26, 0, 1, 'winner') / regular,
      repeat3VsRegular80: demand(ability, 26, 0, 1, 'repeat3') / regular,
      secondTierShare: demand(ability, 26, 1, 1, 'none') / demand(ability, 26, 0, 1, 'none'),
      yearlyGBP2024: footballQuote('ENG', 2024, demand(ability, 26, 0, 1, 'none')),
      winnerYearlyGBP2024: footballQuote('ENG', 2024, demand(ability, 26, 0, 1, 'winner')),
      eraGBP: [1901, 1930, 1970, 1994, 2024, 2036].map((year) => ({
        year,
        base: footballQuote('ENG', year, demand(ability, 26, 0, 1, 'none')),
        winner: footballQuote('ENG', year, demand(ability, 26, 0, 1, 'winner')),
      })),
    })),
  });
}
Object.assign(MARKET_CONFIG.star, current.star);
Object.assign(BALLON_DOR_CONFIG.premium, current.premium);
if (results.some((r) => !r.monotonic || !r.finite))
  throw new Error('Wage sensitivity invariant failed');
const out = 'artifacts/benchmarks/star-balance-261103/wage-sensitivity-production.json';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      combinations,
      identity,
      current,
      note: 'Actual pricing and premium functions; ordinary comparator OVR80 age26, agent1. Deterministic parameter coverage is separate from future-career measurement.',
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ out, combinations, results }, null, 2));
