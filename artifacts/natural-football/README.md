# Natural football comparison

The standalone comparison shows the same frozen fixture on two pitches: latest-finance baseline `2fe2386d` and final0.8.3 candidate `fc5d4c26`. All three final candidate playbacks exactly match the independently reviewed cover runtime `c1124ede`, including actual inputs, complete records, squads and frames. Both pitches share one clock, real-time 1x, play/pause, speed and seek; Space toggles playback and the arrow keys move five seconds. The generated page embeds its data and opens offline.

Local delivered page: `.tmp/natural-football/index.html`, served at `http://localhost:19610/`. Production tool sources are `scripts/natural-football/`; generated full-match datasets and raw receipts remain in `.tmp/nf14-evidence/` in the coordinator checkout. Small durable measurements are in [261114-measurements.json](261114-measurements.json).

All34approved tasks are locally integrated through `931991c7`. [Final validation evidence](261114-final-validation.json) records the failed broad gates and the passing post-repair material/scripted-browser cases separately. Main publication is blocked by the unchanged historical division-order failure and fresh actual1950checkpoint inflation (all21country/tier cells outside the original±5band). No football code was pushed, and focused successes are not a complete final-gate pass. The paired HTML remains available offline and at the local URL above.

## Fixed comparison

ENG, 2024, club `ENG:0:0:0`, first own league fixture, seeds `viewer-2`, `viewer-3`, `viewer-4`. Baseline and candidate use identical inputs, squads and settled records; the support-only step also keeps the full actual record and script hashes identical to the preceding candidate. The builder compares actual normalized records and frozen squads as well as provenance hashes, so changed score/player facts cannot pass by retaining an old hash.

| Historical first epoch, per seed 2 / 3 / 4 | Original baseline9b701adf | Support candidate |
|---|---|---|
| Close-pressure holding spells of 2 s or longer | 96 / 99 / 97 | 38 / 38 / 29 |
| Circling under pressure | 126 / 149 / 118 | 68 / 77 / 58 |
| Lost passes aimed at nobody | 37 / 35 / 25 | 20 / 21 / 19 |
| Uncalled offside receiver positions at the kick | 5 / 5 / 4 | 0 / 0 / 0 |
| Opposing pairs within 3 m for at least 20 s | 31 / 38 / 42 | 21 / 15 / 33 |

These are observational proxies on three fixed matches. They do not establish universal realism. The final support-angle step changes blocked support options from 3483/23096 (15.081%) to 3421/22923 (14.924%): two fixtures improve and one worsens. Some pressure, circling and sticking counts also worsen relative to the preceding repaired candidate; their full raw values are retained in the JSON. No production threshold was loosened. Pace and chained result flows remain separate work.

## Latest defensive-cover experiment

The currently delivered page uses baseline2fe2386d and final0.8.3 fc5d4c26, whose three complete playbacks exactly match independently reviewed c1124ede, integrated42ad9926. Compared with the preceding natural-football candidate, actual assigned-cover mean distances8.906/9.096/9.167 m become3.195/2.835/3.213; cover handovers1274/1500/1102 become286/223/238 and one-metre vacancy share0.910/0.911/0.907 becomes0.731/0.724/0.711. Inputs and complete settled record/script hashes remain equal on all three seeds. Role assignment follows the nearest existing legal cover point while retaining the closest presser and existing eligibility.

Secondary observations are mixed: pressure-holding38/38/29 becomes34/43/34, circling68/77/58 becomes79/82/64, and sticking21/15/33 becomes22/16/30. Support-screen proxy rates also worsen; this is no pass-completion or universal realism claim. All exact raw evidence, source/review/integration IDs, observed tradeoffs and latest offline smoke are retained under latestExperiment in the JSON. The HTML is locally integrated; complete final batch and main publication are still pending.

## Rebuild

Export each installed checkout with the same fixture options, then build and smoke the page:

```sh
pnpm exec tsx scripts/natural-football/export.ts --repo /path/to/baseline-checkout --out /tmp/baseline.json.gz --seed viewer-2
pnpm exec tsx scripts/natural-football/export.ts --repo /path/to/candidate-checkout --out /tmp/candidate.json.gz --seed viewer-2
pnpm exec tsx scripts/natural-football/build.ts --baseline /tmp/baseline.json.gz --candidate /tmp/candidate.json.gz --out /tmp/natural-football/index.html --locale ko-KR
pnpm exec tsx scripts/natural-football/smoke.ts --page /tmp/natural-football/index.html --screenshot /tmp/natural-football/desktop.png
```

The frozen baseline commit is retained in Git history. A changed fixture input or settled record fails the build. Raw sampled metrics use the unchanged remote measurement scripts captured by hash in the JSON; the full-precision displayed pressure diagnostic may differ by one threshold-boundary sample from the rounded export proxy.

## Football references

The movement hypotheses follow [FIFA's support and passing-angle session](https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/sessions/support-and-off-the-ball-movements.php), [central-midfielder support](https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/position-specific-training/game-situations-developing-central-midfielders.php) and [pressure with central cover](https://www.fifatrainingcentre.com/en/practice/training-perspectives/mid-block-instincts/introducing-mid-block-instincts-in-small-units.php). Receiver timing follows [IFAB Law 11](https://www.theifab.com/laws/latest/offside/): position at the kick, with the direct goal-kick, throw-in and corner exemptions preserved. These sources motivate the rules; the experiment's numerical effects come from this repository's fixed runs.
