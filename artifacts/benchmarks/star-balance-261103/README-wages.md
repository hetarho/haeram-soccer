# Star wage calibration — 261103

The selected candidate preserves ordinary wages through OVR 80, adds a convex scarcity premium above it (up to ×2 at 95), and phases out the division discount between 85 and 90. A recent Ballon d'Or win multiplies the resulting wage by 2, a second recent win by 2.4, a third by 2.8; a podium without a win gives 1.4. Existing signed wages change only at a contract negotiation.

The comparison is main `6772731c` plus the wage candidate. Both forecast arms use T688's new award ranking. Baseline arms restore the former wage curve and ×1.2/1.1 award premiums. The original export is read only: SHA256 `7301678bedb8f308e558f02cfe8342d77eec5a974482e79fa3432fd30a847f18`.

## Parameter coverage

`wage-sensitivity-production.json`: 144,000 baseline/candidate combinations over ability 40–99, six ages, four divisions, five agents, five honour histories and two potential gaps. All demands are finite, positive and monotonic with ability. Additional nominal quotes cover 1901, 1930, 1970, 1994, 2024 and 2036.

The ordinary OVR80/60 ratio remains 7.366 (target 6–10); an ordinary second-tier player remains at 40% of the equivalent top-flight wage (target 35–50%). Elite players at 90+ demand top-flight terms in every division.

Illustrative 2024 annual GBP, age 26, potential equal to ability, agent 1, top flight, before build effects and contractual bonuses:

| OVR | Base | One recent win | Three recent wins | Base / ordinary OVR80 |
|---|---:|---:|---:|---:|
| 80 | £2.22m | £4.43m | £6.21m | 1.00 |
| 90 | £8.69m | £17.39m | £24.34m | 3.92 |
| 95 | £19.83m | £39.66m | £55.52m | 8.94 |
| 99 | £29.56m | £59.13m | £82.78m | 13.33 |

These are model prices, not estimates of named players' actual contracts. The [MLSPA official 2025 salary guide](https://s3.amazonaws.com/mlspa/2025-Fall-Salary-Release.pdf) provides a primary-source scale check for exceptional pay: Messi's $12m base and $20.45m guaranteed compensation sit far above ordinary salaries. MLS roster rules and guaranteed compensation differ from this game's European base wages, so that observation is an outlier reference, not an exact equivalence target. Fame-only left unawarded elite players too cheap; an aggressive alternative produced about 66 times ordinary OVR80 pay and was rejected.

## Existing-career forecasts

`wage-careers.json`: four paired future streams from the owner's exact export, each closing the initial partial 2036 season and four whole seasons. `wage-careers-validation.json`: two further paired streams, each with the partial close and two whole seasons. Total: six independent future streams, 40 whole-season outcomes across both arms, plus 12 partial closes. Saved player attributes, contracts and past facts are retained; only the subsequent random seed differs between future streams.

| Whole-season wage bill / revenue | Former wages | Candidate |
|---|---:|---:|
| Mean | 16.06% | 21.13% |
| Minimum | 8.75% | 15.19% |
| Maximum | 25.69% | 33.47% |
| Bankrupt trajectories | 0 / 6 | 0 / 6 |

The owner starts with exceptionally large retained cash and revenue, so these forecasts show prospective costs and continuity, not a universal economy calibration. Standings and departures remain equal between paired arms because this rich club can meet both sets of asks. No claim is made that higher wages force every star to leave.

## Retention under constrained budgets

`wage-retention.json`: 576 controlled decisions through the actual `talkTerms` and `staffTalkVerdict` functions. Vary OVR 80/90/95, age 26/33, division 0/1, agent 1/5, zero/one/three recent wins, and annual revenue at 1.6/2/4/8 times the former wage bill. Teammates retain their saved wages. Cash is deliberately ample, isolating the income-based affordability checks. These synthetic decisions are separate from simulated career outcomes.

Of 288 paired scenarios, the former formula permits 284 renewals and the candidate permits 186. There are 98 newly unaffordable renewals. Ordinary OVR80 cases without an award have no changed verdict. In 106 individual decisions, the income-based wage ceiling rejects the request despite ample cash. Existing cash-runway, season-end projection, negotiation floor and wage-cap behavior are also covered by the contract integration tests.

## Reproduce

Run from the repository root with the retained original export available:

```sh
pnpm exec tsx scripts/star-wage-sensitivity.ts
pnpm exec tsx scripts/star-wage-retention.ts /tmp/haeram-2036.haeram-save.json
pnpm exec tsx scripts/star-wage-careers.ts --seeds 4 --seasons 4 --jobs 2
pnpm exec tsx scripts/star-wage-careers.ts --seeds 2 --seed-offset 4 --seasons 2 --jobs 2 --out artifacts/benchmarks/star-balance-261103/wage-careers-validation.json
```

Sensitivity, retention and the later validation record dependency fingerprints. The initial four-stream forecast predates that metadata addition; its input, base commit, candidate configuration and unchanged calculation body are retained, but no initial full dependency fingerprint was captured. Scoring experiments are disabled by default and are not part of the selected wage implementation.
