# Club cash flow and transfer values, 261109

Released source: `60c5d4ba`. Candidate: T731 modern transfer-growth reach plus T732 sporting-quality-first recruitment. Same seed `economy-ec09-0`, identical generated pre-takeover worlds, five complete seasons per case, every delegation enabled, no construction or owner money moved. Owner living costs are disabled only in these measurement processes to isolate club finance. Money stays in each country's nominal minor units; ratios are averaged within seasons, never summed across currencies or eras.

| Period and club | Annual cash increase / revenue, before → after | Purchases / revenue, before → after | Wage samples / revenue, before → after |
|---|---:|---:|---:|
| 1950–54, ENG top flight | 28.5% → 27.9% | 7.6% → 8.8% | 40.8% → 40.4% |
| 1950–54, ESP initially second tier | 27.7% → 24.2% | 22.3% → 27.2% | 37.2% → 36.3% |
| 2025–29, ENG top flight | 46.5% → 43.5% | 2.2% → 8.3% | 22.1% → 22.4% |
| 2025–29, ESP initially second tier | 50.0% → 29.7% | 26.0% → 31.2% | 22.8% → 17.0% |

The modern pair's mean annual cash increase falls from **48.25% to 36.60%** of turnover; historical cases fall from 28.12% to 26.07%. No sampled club goes bankrupt. This meets the frozen experiment's cash-improvement criterion, but **does not meet the wider realistic-economy goal**: cash still accumulates and wage ratios remain below ECON-29's band. There is one seed, two countries and five seasons per case, not the 50-season reference-career gate. Sporting progression and sales are reported beside spending in `summary.json`; differing promotion paths affect revenues and ratios, so the aggregate is not an isolated causal estimate of the fee formula alone.

All **40** season rows satisfy the exact cash identity `closingCash - openingBoundaryCash = income - expense`; purchases, sales and turnover reconcile with their retained ledger events. Use the boundary cash, not live opening cash after summer business. The estimated wages sampled before rounds are labeled as samples, not exact cash wages.

`cash-flow-v1.ts` is the immutable measurement harness (SHA256 `9806e2c5...9d1957`). Its free-arrival counts omit some pool top-ups and are lower bounds. No conclusion about complete free counts uses those values. T733 and the reviewed T732 v2 correct the measurement independently. The monetary and paid-fee observations remain valid. Every paired input-world hash and harness hash matches. `source-reuse.json` records byte equality of the three changed production files and why the historical samples apply to the combined source.

Direct price vectors are retained separately. In England in 2025, a top-flight OVR80 player aged20 with potential80 moves from approximately GBP2.58m to GBP13.41m. All48 sampled wage values and all12 sampled1950 fees stay exact. This is a synthetic model comparison, not an observed real-player valuation or proof that the whole transfer distribution is calibrated.

To reproduce, create isolated worktrees for the released and integrated production revisions, install pinned dependencies, and copy the frozen harness into each worktree's `scripts/calibrate-cash-flow.ts`. Generate the same ownerless world with production `historyWorld`/`liveHistory` from1930 to1950 or2025, or reuse the recorded-hash world. Then run:

```sh
pnpm exec tsx scripts/calibrate-cash-flow.ts --year 2025 --country ENG \
  --seed economy-ec09-0 --world-file /tmp/ec09-worlds/economy-ec09-0-2025.json \
  --world-source 60c5d4ba --club ENG:0:0:8 --tier oil --seasons 5 --purse-apart \
  --out /tmp/result.json
```

Use ESP with club `ESP:1:0:0` for the second case; year1950 for the historical cases. Whole-world generation uses the production day loop, without skipped leagues or competitions. Generation to1950 took15.3s; continuation from1950 to2025 took220.3s under uncontrolled host load. Timings are cost context, not a speed comparison.

Real-football context consulted: [UEFA club finance](https://ecfil.uefa.com/) and [FIFA 2025 international transfers](https://inside.fifa.com/transfer-system/media-releases/international-transfers-reach-historic-high-2025). Neither source identifies a specific OVR-to-fee conversion. Further calibration needs market wages/income across eras and actual paid-fee distributions; NPC buyer budgets remain a separate world-economy issue.


## Verification and residual evidence

The coordinator's verified source is731ed705488fc5d1bc13f1529a89f783c75c0cef; all five adopted tasks are integrated on the original main checkout. `ec09-affected/result.json` records the final passing batch: unit2299, integration1179 passed with4 existing skips, contract46, all six fast checks and the build. Chromium coverage is348 passed:346 unchanged cases from the complete run plus both management journeys freshly passing after the reviewed test correction. `verification-index.json` maps retained historical log paths to their gzip copies (decompressed bytes retained exactly). The interrupted initial attempt and the complete run's one failure remain visible in `ec09-initial` and `ec09-resume`; they are not mislabeled as successful runs.

The three coordinator gate scripts, independent review receipts, integration receipt and final work-finish receipt are retained beside the raw measurements. The final report explains the freshness-only resubmission after concurrent unrelated planning. Only spec/artifact documentation changes after the verified source; those changes preserve its computation scope.

`ec09-residual-books.json`, `ec09-residual-indices.json` and `ec09-real-distribution-check.txt` retain read-only follow-up observations for unadopted F6/F7. Player-only NPC payroll, owned-club sampled wage bills and real all-staff wages have different definitions. Current-division grouping may differ from the recorded season's division. These observations identify remaining calibration work and are not a new successful economy gate. Official context: [Premier League2024/25 central payments](https://www.premierleague.com/en/news/4325409), [Deloitte2023/24 European football finances](https://www.deloitte.com/uk/en/about/press-room/deloitte-annual-review-of-football-finance-european-football-market-revenue.html).
